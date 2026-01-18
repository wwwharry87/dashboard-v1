'use strict';

/**
 * aiController.js
 *
 * "Pergunte ao Dashboard" usando DeepSeek de forma SEGURA:
 * - O LLM apenas traduz pergunta -> SPEC ESTRUTURADO (JSON)
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
const DEEPSEEK_TIMEOUT_MS = Number(process.env.DEEPSEEK_TIMEOUT_MS || 12000);

function sanitizeQuestion(q) {
  return String(q || '').trim().slice(0, 800);
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function normalizeText(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

// ---------------- Allow-lists ----------------

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
    sql: 'COUNT(DISTINCT idmatricula)',
  },
  matriculas_ativas: {
    label: 'Matrículas ativas',
    sql: `COUNT(DISTINCT CASE
      WHEN UPPER(COALESCE(situacao_matricula,'')) IN ('ATIVO','ATIVA') OR COALESCE(idsituacao,0)=0
      THEN idmatricula END)`,
  },
  desistentes: {
    label: 'Desistentes',
    sql: `COUNT(DISTINCT CASE WHEN COALESCE(idsituacao,0)=2 THEN idmatricula END)`,
  },
  taxa_evasao: {
    label: 'Taxa de evasão (%)',
    sql: `CASE WHEN COUNT(DISTINCT idmatricula) > 0
      THEN ROUND((COUNT(DISTINCT CASE WHEN COALESCE(idsituacao,0)=2 THEN idmatricula END) * 100.0) / COUNT(DISTINCT idmatricula), 2)
      ELSE 0 END`,
  },
};

// ---------------- Helpers (comparativo por ano) ----------------

function metricSqlForYear(metricKey, yearParamRef) {
  const y = yearParamRef;

  if (metricKey === 'total_matriculas') {
    return `COUNT(DISTINCT CASE WHEN ano_letivo = ${y} THEN idmatricula END)`;
  }

  if (metricKey === 'matriculas_ativas') {
    return `COUNT(DISTINCT CASE
      WHEN ano_letivo = ${y} AND (
        UPPER(COALESCE(situacao_matricula,'')) IN ('ATIVO','ATIVA') OR COALESCE(idsituacao,0)=0
      ) THEN idmatricula END)`;
  }

  if (metricKey === 'desistentes') {
    return `COUNT(DISTINCT CASE WHEN ano_letivo = ${y} AND COALESCE(idsituacao,0)=2 THEN idmatricula END)`;
  }

  if (metricKey === 'taxa_evasao') {
    const denom = `COUNT(DISTINCT CASE WHEN ano_letivo = ${y} THEN idmatricula END)`;
    const num = `COUNT(DISTINCT CASE WHEN ano_letivo = ${y} AND COALESCE(idsituacao,0)=2 THEN idmatricula END)`;
    return `CASE WHEN ${denom} > 0 THEN ROUND((${num} * 100.0) / ${denom}, 2) ELSE 0 END`;
  }

  return null;
}

function extractJsonMaybe(content) {
  const raw = String(content || '').trim();
  if (!raw) return null;

  // JSON puro
  try {
    return JSON.parse(raw);
  } catch (_) {}

  // ```json ... ```
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (m?.[1]) {
    try {
      return JSON.parse(m[1]);
    } catch (_) {}
  }

  // primeiro { ... } até último }
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s >= 0 && e > s) {
    const candidate = raw.slice(s, e + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {}
  }

  return null;
}

function normalizeSpec(spec) {
  if (!spec || typeof spec !== 'object') return null;

  const type = String(spec.type || '').trim();
  const metric = String(spec.metric || '').trim();

  const groupBy = spec.groupBy === null || spec.groupBy === undefined
    ? null
    : String(spec.groupBy).trim();

  const where = (spec.where && typeof spec.where === 'object' && !Array.isArray(spec.where))
    ? spec.where
    : {};

  const limit = clampInt(spec.limit, 1, 50, 20);

  const compare = spec.compare && typeof spec.compare === 'object' ? spec.compare : null;

  const normalized = { type, metric, groupBy, where, limit };

  if (type === 'compare') {
    const baseYear = Number(compare?.baseYear);
    const compareYear = Number(compare?.compareYear);
    const direction = String(compare?.direction || 'all');

    normalized.compare = {
      baseYear: Number.isFinite(baseYear) ? baseYear : null,
      compareYear: Number.isFinite(compareYear) ? compareYear : null,
      direction: ['decrease', 'increase', 'all'].includes(direction) ? direction : 'all',
    };
  }

  return normalized;
}

// ---------------- Heurística (melhor UX / menos frustração) ----------------
// OBS: existiam 2 funções heuristicSpec duplicadas. Agora é SÓ UMA.

function heuristicSpec(questionRaw) {
  const q = String(questionRaw || '').toLowerCase();
  const years = (q.match(/\b(19|20)\d{2}\b/g) || [])
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));

  const wantsCompare = /(compar|comparativo|comparar|diferen|varia|cres|aument|redu|queda|dimin)/.test(q);

  // comparativo exige pelo menos 2 anos
  if (wantsCompare && years.length >= 2) {
    const baseYear = years[0];
    const compareYear = years[1];

    // inferir direção
    const direction =
      /(redu|queda|dimin)/.test(q) ? 'decrease'
      : /(aument|cres)/.test(q) ? 'increase'
      : 'all';

    // inferir métrica
    const metric =
      q.includes('evas') ? 'taxa_evasao'
      : q.includes('ativa') ? 'matriculas_ativas'
      : q.includes('desist') ? 'desistentes'
      : 'total_matriculas';

    // inferir groupBy (PowerBI feeling)
    // - se fala "onde" / "quais escolas" / "por escola" => escola
    let groupBy = null;
    if (/por\s+escola|quais\s+escolas|onde\s+tiv|onde\s+houve|onde\s+teve|escolas/.test(q)) groupBy = 'escola';
    else if (/por\s+turno/.test(q)) groupBy = 'turno';
    else if (/por\s+sexo/.test(q)) groupBy = 'sexo';
    else if (/por\s+zona/.test(q) && q.includes('escola')) groupBy = 'zona_escola';
    else if (/por\s+zona/.test(q) && q.includes('aluno')) groupBy = 'zona_aluno';

    // se pediu “redução/aumento” e não definiu groupBy, assume escola (melhor resposta)
    if (!groupBy && (direction === 'decrease' || direction === 'increase') && /onde|quais/.test(q)) {
      groupBy = 'escola';
    }

    return {
      type: 'compare',
      metric,
      groupBy,
      where: {},
      limit: 20,
      compare: { baseYear, compareYear, direction },
    };
  }

  // breakdown rápido
  if (/\bpor\s+sexo\b/.test(q)) {
    return { type: 'breakdown', metric: 'total_matriculas', groupBy: 'sexo', where: {}, limit: 20 };
  }
  if (/\bpor\s+turno\b/.test(q)) {
    return { type: 'breakdown', metric: 'total_matriculas', groupBy: 'turno', where: {}, limit: 20 };
  }
  if (/\bpor\s+situ/i.test(q) || /situa[cç][aã]o\s+da\s+matr/i.test(q)) {
    return { type: 'breakdown', metric: 'total_matriculas', groupBy: 'situacao_matricula', where: {}, limit: 20 };
  }

  // single
  if (/taxa\s+de\s+evas[aã]o/.test(q) || /evas[aã]o/.test(q)) {
    return { type: 'single', metric: 'taxa_evasao', groupBy: null, where: {}, limit: 20 };
  }
  if (/matr[ií]culas\s+ativas|ativas/.test(q)) {
    return { type: 'single', metric: 'matriculas_ativas', groupBy: null, where: {}, limit: 20 };
  }
  if (/total\s+de\s+matr[ií]culas|total\s+matr[ií]culas/.test(q)) {
    return { type: 'single', metric: 'total_matriculas', groupBy: null, where: {}, limit: 20 };
  }

  return null;
}

// ---------------- DeepSeek -> Spec ----------------

async function deepseekToSpec(question, context) {
  const cacheKey = `ai_spec_${Buffer.from(JSON.stringify({ question, context })).toString('base64').slice(0, 120)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  if (!DEEPSEEK_API_KEY) {
    const spec = { type: 'error', message: 'DEEPSEEK_API_KEY não configurada no backend.' };
    cache.set(cacheKey, spec);
    return spec;
  }

  const system = `Você traduz perguntas em linguagem natural para uma CONSULTA ESTRUTURADA (JSON) sobre matrículas escolares.
Regras:
- Responda SOMENTE com JSON válido (sem texto fora do JSON).
- Nunca peça ou retorne dados pessoais (nome de aluno, CPF, etc.).
- Use apenas estas métricas: ${Object.keys(ALLOWED_METRICS).join(', ')}.
- Use apenas estas dimensões: ${Object.keys(ALLOWED_DIMENSIONS).join(', ')}.
- Se não for possível responder com segurança, retorne {"type":"unsupported","reason":"..."}.

Formato:
{
  "type": "single" | "breakdown" | "compare" | "unsupported",
  "metric": "total_matriculas" | "matriculas_ativas" | "desistentes" | "taxa_evasao",
  "groupBy": "<dimension>" | null,
  "where": { "<dimension>": "<value>", ... },
  "limit": 20,
  "compare": { "baseYear": 2025, "compareYear": 2026, "direction": "decrease" | "increase" | "all" }
}

Notas:
- "por <dimensão>" => type="breakdown" e groupBy.
- Apenas um número => type="single".
- Comparativo entre anos => type="compare" com compare.
- Em "compare", groupBy pode ser null (geral) ou uma dimensão (ex.: escola).
- where só para filtros extras; contexto já traz filtros aplicados no dashboard.`;

  const user = `Pergunta: ${question}
Contexto (filtros já aplicados): ${JSON.stringify(context || {})}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);

  let json;
  try {
    const resp = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
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

    json = await resp.json();
  } catch (e) {
    const spec = { type: 'unsupported', reason: `Falha ao chamar IA (timeout/rede): ${e?.message || 'erro'}` };
    cache.set(cacheKey, spec);
    clearTimeout(t);
    return spec;
  } finally {
    clearTimeout(t);
  }

  const content = json?.choices?.[0]?.message?.content;
  let spec = extractJsonMaybe(content);
  if (!spec) spec = { type: 'unsupported', reason: 'A IA não retornou JSON válido.' };

  cache.set(cacheKey, spec);
  return spec;
}

// ---------------- Filtros ----------------

function mergeFilters(contextFilters, whereFromLLM) {
  const merged = { ...(contextFilters || {}) };
  const where = whereFromLLM || {};

  for (const [k, v] of Object.entries(where)) {
    if (!ALLOWED_DIMENSIONS[k]) continue;
    if (v === undefined || v === null || v === '') continue;

    // converte nomes para padrão usado no buildWhereClause
    if (k === 'ano_letivo') merged.anoLetivo = v;
    else merged[k] = v;
  }

  return merged;
}

// ---------------- Execução SQL segura ----------------

async function runQuery(spec, contextFilters, user) {
  const metricDef = ALLOWED_METRICS[spec.metric];
  if (!metricDef) return { ok: false, message: 'Métrica não suportada.' };

  const mergedFilters = mergeFilters(contextFilters, spec.where);

  const normalizedFilters = {
    ...mergedFilters,
    // compatibilidade com controller existente
    anoLetivo: mergedFilters.anoLetivo ?? mergedFilters.ano_letivo,
    situacaoMatricula: mergedFilters.situacaoMatricula ?? mergedFilters.situacao_matricula,
  };

  // Em comparativo, NÃO filtra por ano_letivo no WHERE
  const normalizedForWhere = { ...normalizedFilters };
  if (spec.type === 'compare') {
    delete normalizedForWhere.anoLetivo;
    delete normalizedForWhere.ano_letivo;
  }

  const { clause, params } = buildWhereClause(normalizedForWhere, user);

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
    const limit = clampInt(spec.limit, 1, 50, 20);

    const sql = `${base}
      SELECT ${labelExpr} AS label, ${metricDef.sql} AS value
      FROM base_sem_especiais
      GROUP BY ${labelExpr}
      ORDER BY value DESC
      LIMIT ${limit};`;

    const result = await pool.query(sql, params);
    return { ok: true, kind: 'breakdown', rows: result.rows || [], groupBy: spec.groupBy };
  }

  if (spec.type === 'compare') {
    const baseYear = Number(spec?.compare?.baseYear);
    const compareYear = Number(spec?.compare?.compareYear);
    const direction = String(spec?.compare?.direction || 'all');

    if (!Number.isFinite(baseYear) || !Number.isFinite(compareYear)) {
      return { ok: false, message: 'Para comparar, preciso de dois anos (ex.: 2025 e 2026).' };
    }

    const limit = clampInt(spec.limit, 1, 50, 20);

    // adiciona anos como parâmetros
    const pBase = `$${params.length + 1}`;
    const pComp = `$${params.length + 2}`;
    const newParams = [...params, baseYear, compareYear];

    const sqlBase = metricSqlForYear(spec.metric, pBase);
    const sqlComp = metricSqlForYear(spec.metric, pComp);
    if (!sqlBase || !sqlComp) {
      return { ok: false, message: 'Métrica não suportada para comparativo.' };
    }

    const deltaExpr = `(${sqlComp}) - (${sqlBase})`;
    const pctExpr = `CASE WHEN (${sqlBase}) > 0 THEN ROUND((${deltaExpr}) * 100.0 / NULLIF((${sqlBase}),0), 2) ELSE NULL END`;

    // ✅ CORREÇÃO DO BUG DO POSTGRES:
    // NÃO usar ABS(delta) (alias). Usar ABS da expressão real.
    const orderBy =
      direction === 'decrease' ? `(${deltaExpr}) ASC` :
      direction === 'increase' ? `(${deltaExpr}) DESC` :
      `ABS((${deltaExpr})) DESC`;

    // comparativo geral
    if (!spec.groupBy) {
      const sql = `${base}
        SELECT
          (${sqlBase}) AS base_value,
          (${sqlComp}) AS compare_value,
          (${deltaExpr}) AS delta,
          (${pctExpr}) AS pct_change
        FROM base_sem_especiais;`;

      const result = await pool.query(sql, newParams);
      const row = result.rows?.[0] || {};
      return {
        ok: true,
        kind: 'compare',
        compare: { baseYear, compareYear, direction },
        rows: [
          {
            label: 'Geral',
            base_value: Number(row.base_value) || 0,
            compare_value: Number(row.compare_value) || 0,
            delta: Number(row.delta) || 0,
            pct_change: row.pct_change === null ? null : Number(row.pct_change),
          },
        ],
      };
    }

    const dim = ALLOWED_DIMENSIONS[spec.groupBy];
    if (!dim) return { ok: false, message: 'Dimensão de agrupamento não suportada.' };

    const labelExpr = `COALESCE(${dim.col}::text, 'Sem informação')`;

    const sql = `${base}
      SELECT
        ${labelExpr} AS label,
        (${sqlBase}) AS base_value,
        (${sqlComp}) AS compare_value,
        (${deltaExpr}) AS delta,
        (${pctExpr}) AS pct_change
      FROM base_sem_especiais
      GROUP BY ${labelExpr}
      ORDER BY ${orderBy}
      LIMIT ${limit};`;

    const result = await pool.query(sql, newParams);
    const rows = (result.rows || []).map((r) => ({
      label: r.label,
      base_value: Number(r.base_value) || 0,
      compare_value: Number(r.compare_value) || 0,
      delta: Number(r.delta) || 0,
      pct_change: r.pct_change === null ? null : Number(r.pct_change),
    }));

    return { ok: true, kind: 'compare', compare: { baseYear, compareYear, direction }, groupBy: spec.groupBy, rows };
  }

  return { ok: false, message: 'Consulta não suportada.' };
}

// ---------------- Formatadores PT-BR ----------------

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

// ---------------- Controller ----------------

const query = async (req, res) => {
  try {
    const question = sanitizeQuestion(req.body?.question);
    const contextFilters = req.body?.filters || {};

    if (!question) {
      return res.status(400).json({ error: 'Informe uma pergunta.' });
    }

    // 1) Heurística (melhor UX, menos dependência do LLM)
    const heur = heuristicSpec(question);

    // 2) DeepSeek (se não tiver heurística)
    const rawSpec = heur || (await deepseekToSpec(question, contextFilters));

    if (rawSpec?.type === 'error') {
      return res.status(500).json({ error: rawSpec.message });
    }

    const spec = normalizeSpec(rawSpec);

    if (!spec || spec.type === 'unsupported') {
      // Resposta mais humana (sem repetir aquela frase inteira sempre)
      return res.json({
        ok: false,
        kind: 'clarify',
        answer:
          `Não peguei exatamente o formato da sua pergunta ainda.\n\n` +
          `Me diga 1) a métrica e 2) como quer “quebrar” ou comparar.\n\n` +
          `Exemplos:\n` +
          `• "Total de matrículas"\n` +
          `• "Matrículas por turno"\n` +
          `• "Comparar matrículas 2026 e 2025 por escola"\n` +
          `• "Comparar matrículas ativas 2026 e 2025 onde reduziu"`,
        suggestions: [
          'Total de matrículas',
          'Matrículas por turno',
          'Matrículas por sexo',
          'Comparar matrículas 2026 e 2025 por escola',
          'Comparar matrículas ativas 2026 e 2025 por escola (onde reduziu)',
        ],
        spec: rawSpec,
      });
    }

    // validações finais
    if (!ALLOWED_METRICS[spec.metric]) {
      return res.json({ ok: false, answer: 'Métrica não suportada nessa versão.' });
    }

    if (spec.type === 'breakdown') {
      if (!spec.groupBy || !ALLOWED_DIMENSIONS[spec.groupBy]) {
        return res.json({ ok: false, answer: 'Dimensão de agrupamento não suportada nessa versão.' });
      }
    }

    if (spec.type === 'compare') {
      const by = spec.groupBy;
      if (by && !ALLOWED_DIMENSIONS[by]) {
        return res.json({ ok: false, answer: 'Dimensão de agrupamento não suportada nessa versão.' });
      }
      if (!spec?.compare?.baseYear || !spec?.compare?.compareYear) {
        return res.json({
          ok: false,
          kind: 'clarify',
          answer: 'Para comparar, preciso dos dois anos. Ex.: "Comparar matrículas 2026 e 2025".',
          suggestions: [
            'Comparar matrículas 2026 e 2025',
            'Comparar matrículas 2026 e 2025 por escola',
          ],
        });
      }
    }

    const result = await runQuery(spec, contextFilters, req.user);

    if (!result.ok) {
      return res.json({ ok: false, answer: result.message || 'Não consegui executar essa consulta.' });
    }

    const metricLabel = ALLOWED_METRICS[spec.metric].label;

    if (result.kind === 'single') {
      const valueFmt =
        spec.metric === 'taxa_evasao'
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
        label: normalizeText(r.label) || 'Sem informação',
        value: Number(r.value) || 0,
      }));

      return res.json({
        ok: true,
        answer: `${metricLabel} por ${String(result.groupBy).replace('_', ' ')}`,
        data: { rows, groupBy: result.groupBy, metric: spec.metric },
        spec,
      });
    }

    if (result.kind === 'compare') {
      const baseYear = result.compare?.baseYear;
      const compareYear = result.compare?.compareYear;
      const groupLabel = spec.groupBy ? ` por ${String(spec.groupBy).replace('_', ' ')}` : '';
      const dir = String(result.compare?.direction || 'all');
      const dirTxt = dir === 'decrease' ? 'redução' : dir === 'increase' ? 'aumento' : 'variação';

      return res.json({
        ok: true,
        kind: 'compare',
        answer: `${metricLabel}${groupLabel} — comparativo ${compareYear} vs ${baseYear} (${dirTxt})`,
        data: {
          rows: result.rows,
          groupBy: spec.groupBy || null,
          metric: spec.metric,
          compare: result.compare,
        },
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
