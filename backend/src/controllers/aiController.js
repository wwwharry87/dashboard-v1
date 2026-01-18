'use strict';

/**
 * aiController.js
 *
 * MVP seguro de "Pergunte ao Dashboard" usando DeepSeek.
 * - O LLM apenas traduz a pergunta em uma CONSULTA ESTRUTURADA (JSON)
 * - O servidor executa SQL parametrizado com allow-list de métricas/dimensões
 * - Nunca retorna PII (nomes de alunos, CPF, etc.)
 */

const pool = require('../config/db');
const NodeCache = require('node-cache');
const { buildWhereClause } = require('./dashboardController');

const cache = new NodeCache({ stdTTL: 180, checkperiod: 60 });

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

function sanitizeQuestion(q) {
  return String(q || '').trim().slice(0, 800);
}

const ALLOWED_DIMENSIONS = {
  ano_letivo: { col: 'ano_letivo', type: 'int' },
  escola: { col: 'escola', type: 'text' },
  zona_escola: { col: 'zona_escola', type: 'text' },
  zona_aluno: { col: 'zona_aluno', type: 'text' },
  sexo: { col: 'sexo', type: 'text' },
  turno: { col: 'turno', type: 'text' },
  situacao_matricula: { col: 'situacao_matricula', type: 'text' },
  etapa_matricula: { col: 'etapa_matricula', type: 'text' },
  grupo_etapa: { col: 'grupo_etapa', type: 'text' },
  deficiencia: { col: 'deficiencia', type: 'text' },
  transporte_escolar: { col: 'transporte_escolar', type: 'text' },
  multisserie: { col: 'multisserie', type: 'text' },
  tipo_matricula: { col: 'tipo_matricula', type: 'text' },
  tipo_transporte: { col: 'tipo_transporte', type: 'text' },
};

const ALLOWED_METRICS = {
  total_matriculas: {
    label: 'Total de matrículas',
    sql: 'COUNT(DISTINCT idmatricula)'
  },
  matriculas_ativas: {
    label: 'Matrículas ativas',
    sql: `COUNT(DISTINCT CASE 
      WHEN UPPER(COALESCE(situacao_matricula,'')) IN ('ATIVO','ATIVA') OR COALESCE(idsituacao,0)=0
      THEN idmatricula END)`
  },
  desistentes: {
    label: 'Desistentes',
    sql: `COUNT(DISTINCT CASE WHEN COALESCE(idsituacao,0)=2 THEN idmatricula END)`
  },
  taxa_evasao: {
    label: 'Taxa de evasão (%)',
    // taxa_evasao = desistentes / total * 100 (base sem idetapa 98/99)
    sql: `CASE WHEN COUNT(DISTINCT idmatricula) > 0
      THEN ROUND((COUNT(DISTINCT CASE WHEN COALESCE(idsituacao,0)=2 THEN idmatricula END) * 100.0) / COUNT(DISTINCT idmatricula), 2)
      ELSE 0 END`
  },
};

async function deepseekToSpec(question, context) {
  // Cache pequeno por (pergunta+context) para economizar tokens
  const cacheKey = `ai_spec_${Buffer.from(JSON.stringify({ question, context })).toString('base64').slice(0, 120)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  if (!DEEPSEEK_API_KEY) {
    return {
      type: 'error',
      message: 'DEEPSEEK_API_KEY não configurada no backend.'
    };
  }

  const system = `Você é um tradutor de perguntas em linguagem natural para uma CONSULTA ESTRUTURADA (JSON) sobre matrículas escolares.
Regras:
- Responda SOMENTE com JSON válido (sem texto fora do JSON).
- Nunca peça ou retorne dados pessoais (nome de aluno, CPF, etc.).
- Use apenas estas métricas: ${Object.keys(ALLOWED_METRICS).join(', ')}.
- Use apenas estas dimensões para agrupamento: ${Object.keys(ALLOWED_DIMENSIONS).join(', ')}.
- Se a pergunta não puder ser atendida com segurança, retorne {"type":"unsupported","reason":"..."}.

Formato:
{
  "type": "single" | "breakdown" | "unsupported",
  "metric": "total_matriculas" | "matriculas_ativas" | "desistentes" | "taxa_evasao",
  "groupBy": "<dimension>" | null,
  "where": { "<dimension>": "<value>", ... },
  "limit": 20
}

Notas:
- Se a pergunta pedir "por" alguma dimensão (ex.: por sexo/turno), use type="breakdown" e groupBy.
- Se pedir apenas um número, use type="single" e groupBy=null.
- where deve incluir apenas filtros adicionais; o contexto já traz filtros selecionados.`;

  const user = `Pergunta: ${question}
\nContexto atual (filtros já aplicados pelo usuário): ${JSON.stringify(context || {})}`;

  const resp = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      temperature: 0.1,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content;

  let spec;
  try {
    spec = JSON.parse(content);
  } catch (e) {
    spec = { type: 'unsupported', reason: 'A IA não retornou JSON válido.' };
  }

  cache.set(cacheKey, spec);
  return spec;
}

function mergeFilters(contextFilters, whereFromLLM) {
  const merged = { ...(contextFilters || {}) };
  const where = whereFromLLM || {};

  for (const [k, v] of Object.entries(where)) {
    if (!ALLOWED_DIMENSIONS[k]) continue;
    if (v === undefined || v === null || v === '') continue;
    // mapeamento amigável (ex.: user pode falar zona_escola, sexo, turno etc.)
    merged[k === 'ano_letivo' ? 'anoLetivo' : k] = v;
  }

  return merged;
}

async function runQuery(spec, contextFilters, user) {
  const metricDef = ALLOWED_METRICS[spec.metric];
  if (!metricDef) return { ok: false, message: 'Métrica não suportada.' };

  const mergedFilters = mergeFilters(contextFilters, spec.where);

  // Converte nomes para o padrão do buildWhereClause
  const normalizedFilters = {
    ...mergedFilters,
    // compatibilidade com o controller existente
    anoLetivo: mergedFilters.anoLetivo ?? mergedFilters.ano_letivo,
    situacaoMatricula: mergedFilters.situacaoMatricula ?? mergedFilters.situacao_matricula,
  };

  const { clause, params } = buildWhereClause(normalizedFilters, user);

  const base = `WITH base AS (
    SELECT * FROM dados_matriculas WHERE ${clause}
  ), base_sem_especiais AS (
    SELECT * FROM base WHERE COALESCE(idetapa_matricula,0) NOT IN (98,99)
  )`;

  if (spec.type === 'single') {
    const sql = `${base}
      SELECT ${metricDef.sql} AS value
      FROM base_sem_especiais;`;

    const result = await pool.query(sql, params);
    const value = result.rows?.[0]?.value ?? 0;
    return { ok: true, kind: 'single', value };
  }

  if (spec.type === 'breakdown') {
    const dim = ALLOWED_DIMENSIONS[spec.groupBy];
    if (!dim) return { ok: false, message: 'Dimensão de agrupamento não suportada.' };

    const labelExpr = `COALESCE(${dim.col}::text, 'Sem informação')`;
    const limit = Math.min(Math.max(Number(spec.limit || 20), 1), 50);

    const sql = `${base}
      SELECT ${labelExpr} AS label, ${metricDef.sql} AS value
      FROM base_sem_especiais
      GROUP BY ${labelExpr}
      ORDER BY value DESC
      LIMIT ${limit};`;

    const result = await pool.query(sql, params);
    return { ok: true, kind: 'breakdown', rows: result.rows || [], groupBy: spec.groupBy };
  }

  return { ok: false, message: 'Consulta não suportada.' };
}

function formatPtBRNumber(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x ?? '0');
  return n.toLocaleString('pt-BR');
}

function formatPtBRPercent(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return '0,00';
  return n.toFixed(2).replace('.', ',');
}

const query = async (req, res) => {
  try {
    const question = sanitizeQuestion(req.body?.question);
    const contextFilters = req.body?.filters || {};

    if (!question) {
      return res.status(400).json({ error: 'Informe uma pergunta.' });
    }

    const spec = await deepseekToSpec(question, contextFilters);

    if (spec?.type === 'error') {
      return res.status(500).json({ error: spec.message });
    }

    if (!spec || spec.type === 'unsupported') {
      return res.json({
        ok: false,
        answer: 'Consigo responder consultas agregadas (totais e quebras por sexo/turno/zona/situação etc.). Tente: "Total de matrículas ativas" ou "Matrículas por sexo".',
        spec,
      });
    }

    // validações finais
    if (!ALLOWED_METRICS[spec.metric]) {
      return res.json({ ok: false, answer: 'Métrica não suportada nessa versão.' });
    }
    if (spec.type === 'breakdown' && !ALLOWED_DIMENSIONS[spec.groupBy]) {
      return res.json({ ok: false, answer: 'Dimensão de agrupamento não suportada nessa versão.' });
    }

    const result = await runQuery(spec, contextFilters, req.user);

    if (!result.ok) {
      return res.json({ ok: false, answer: result.message || 'Não consegui executar essa consulta.' });
    }

    const metricLabel = ALLOWED_METRICS[spec.metric].label;

    if (result.kind === 'single') {
      const valueFmt = spec.metric === 'taxa_evasao'
        ? `${formatPtBRPercent(result.value)}%`
        : formatPtBRNumber(result.value);

      return res.json({
        ok: true,
        answer: `${metricLabel}: ${valueFmt}`,
        data: { value: result.value },
        spec,
      });
    }

    if (result.kind === 'breakdown') {
      const rows = (result.rows || []).map((r) => ({
        label: r.label,
        value: Number(r.value) || 0,
      }));

      return res.json({
        ok: true,
        answer: `${metricLabel} por ${result.groupBy.replace('_', ' ')}`,
        data: { rows, groupBy: result.groupBy, metric: spec.metric },
        spec,
      });
    }

    return res.json({ ok: false, answer: 'Consulta não suportada.' });
  } catch (err) {
    console.error('[aiController] Erro:', err);
    res.status(500).json({ error: 'Erro ao executar consulta IA', details: err.message });
  }
};

module.exports = { query };
