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

function sanitizeHistory(h) {
  // histórico vem do frontend; limitamos tamanho para evitar prompt huge
  const s = String(h || '').trim();
  return s.slice(0, 2000);
}

// (2) Injeção de Domínio: formata os valores existentes no banco (catálogo de filtros)
// para reduzir alucinação de WHERE.
function formatDomainOptions(availableFilters) {
  const f = availableFilters && typeof availableFilters === 'object' ? availableFilters : {};
  const lines = [];

  // preferimos apenas dims que existem na allow-list, mas aceitamos catálogo parcial
  const dimKeys = Object.keys(ALLOWED_DIMENSIONS);
  for (const k of dimKeys) {
    const v = f[k];
    if (!Array.isArray(v) || v.length === 0) continue;

    const uniq = Array.from(new Set(v.map((x) => String(x).trim()).filter(Boolean)));
    const preview = uniq.slice(0, 30).join(', ');
    const suffix = uniq.length > 30 ? ', ...' : '';
    lines.push(`- ${k}: [${preview}${suffix}]`);
  }

  return lines.length ? lines.join('\n') : '';
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
  // etapa/turma (série/ano da turma) — muito usado para perguntas tipo "turmas do 1º ano"
  etapa_turma: { col: 'etapa_turma', type: 'text' },
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
  total_turmas: {
    label: 'Total de turmas',
    // idturma se repete por aluno; por isso DISTINCT
    sql: `COUNT(DISTINCT CASE WHEN idturma IS NOT NULL AND idturma <> 0 THEN idturma END)`
  },
  total_escolas: {
    label: 'Total de escolas',
    sql: `COUNT(DISTINCT CASE WHEN idescola IS NOT NULL AND idescola <> 0 THEN idescola END)`
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

// --- Helpers para comparativos (ano x ano) ---
// Para manter segurança, NUNCA aceitamos SQL livre do usuário.
// O LLM só escolhe métrica/dimensão/anos; o servidor monta SQL parametrizado.

function metricSqlForYear(metricKey, yearParamRef) {
  // yearParamRef deve ser algo como '$3' (parametro do ano)
  const y = yearParamRef;

  if (metricKey === 'total_matriculas') {
    return `COUNT(DISTINCT CASE WHEN ano_letivo = ${y} THEN idmatricula END)`;
  }

  if (metricKey === 'total_turmas') {
    return `COUNT(DISTINCT CASE WHEN ano_letivo = ${y} AND idturma IS NOT NULL AND idturma <> 0 THEN idturma END)`;
  }

  if (metricKey === 'total_escolas') {
    return `COUNT(DISTINCT CASE WHEN ano_letivo = ${y} AND idescola IS NOT NULL AND idescola <> 0 THEN idescola END)`;
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
  // tenta JSON puro
  try {
    return JSON.parse(raw);
  } catch (_) {}

  // tenta extrair de ```json ... ```
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (m?.[1]) {
    try {
      return JSON.parse(m[1]);
    } catch (_) {}
  }

  // tenta encontrar primeiro bloco { ... }
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

function parseLimitFromQuestion(question) {
  const q = String(question || '').toLowerCase();
  // top 10, top10, top-10
  const m1 = q.match(/\btop\s*-?\s*(\d{1,2})\b/);
  if (m1) return Math.min(Math.max(parseInt(m1[1], 10) || 10, 1), 50);

  // "10 primeiras", "5 maiores", "3 menores"
  const m2 = q.match(/\b(\d{1,2})\s*(primeir|maior|menor)\w*\b/);
  if (m2) return Math.min(Math.max(parseInt(m2[1], 10) || 10, 1), 50);

  return null;
}

function inferMetricFromQuestion(q) {
  const s = String(q || '').toLowerCase();
  if (/\bturmas?\b/.test(s)) return 'total_turmas';
  if (/\bquantas?\s+escolas?\b/.test(s) || /\btotal\s+de\s+escolas?\b/.test(s)) return 'total_escolas';
  if (/evas[aã]o/.test(s)) return 'taxa_evasao';
  if (/desistent|aband|evad/.test(s)) return 'desistentes';
  if (/ativa|ativos/.test(s)) return 'matriculas_ativas';
  return 'total_matriculas';
}

function inferGroupByFromQuestion(q) {
  const s = String(q || '').toLowerCase();
  if (/por\s+escola|quais\s+escolas|qual\s+escola|escolas|unidade/.test(s)) return 'escola';
  if (/por\s+turno|turnos|manha|tarde|noite/.test(s)) return 'turno';
  if (/por\s+sexo|mascul|femin|sexo/.test(s)) return 'sexo';
  if (/por\s+situ[aã]c|situa[cç][aã]o\s+da\s+matr[ií]cula/.test(s)) return 'situacao_matricula';
  if (/por\s+zona\s+da\s+escola|zona\s+escola/.test(s)) return 'zona_escola';
  if (/por\s+zona\s+do\s+aluno|zona\s+aluno/.test(s)) return 'zona_aluno';
  if (/por\s+etapa\s+da\s+turma|por\s+etapa\s+turma|etapa\s+turma/.test(s)) return 'etapa_turma';
  if (/por\s+etapa|etapa/.test(s)) return 'etapa_matricula';
  if (/por\s+grupo\s+etapa|grupo\s+etapa/.test(s)) return 'grupo_etapa';
  if (/por\s+tipo\s+de\s+matr[ií]cula|tipo\s+matr[ií]cula/.test(s)) return 'tipo_matricula';
  if (/por\s+defici[eê]ncia|defici[eê]ncia/.test(s)) return 'deficiencia';
  return null;
}

function inferEtapaAnoFromQuestion(q) {
  // tenta inferir "1º ANO", "2º ANO", ... a partir de "1 ano", "1º", "primeiro ano" etc.
  const s = String(q || '').toLowerCase();
  // 1..9
  const m = s.match(/\b([1-9])\s*(?:o|º|°)?\s*ano\b|\b([1-9])\s*(?:o|º|°)\b/);
  const n = Number(m?.[1] || m?.[2]);
  if (Number.isFinite(n) && n >= 1 && n <= 9) return `${n}º ANO`;

  if (/\bprimeir[oa]\s+ano\b/.test(s)) return '1º ANO';
  if (/\bsegund[oa]\s+ano\b/.test(s)) return '2º ANO';
  if (/\bterceir[oa]\s+ano\b/.test(s)) return '3º ANO';
  if (/\bquart[oa]\s+ano\b/.test(s)) return '4º ANO';
  if (/\bquint[oa]\s+ano\b/.test(s)) return '5º ANO';
  if (/\bsext[oa]\s+ano\b/.test(s)) return '6º ANO';
  if (/\bs[eé]tim[oa]\s+ano\b/.test(s)) return '7º ANO';
  if (/\boitav[oa]\s+ano\b/.test(s)) return '8º ANO';
  if (/\bnon[oa]\s+ano\b/.test(s)) return '9º ANO';

  return null;
}


// =========================
// Disambiguação de etapa (1º ano, 2º ano, etc.) usando o catálogo vindo do frontend
// - Turmas -> coluna etapa_turma
// - Matrículas -> coluna etapa_matricula (pode divergir em multisserie)
// Quando houver várias variações no banco, pede confirmação ao usuário e oferece
// opções como "todas separadas" ou "somar todas".
// =========================

function normalizeLoose(str) {
  const s = String(str ?? '').trim();
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function detectSubject(question) {
  const s = String(question || '').toLowerCase();
  if (/\bturmas?\b/.test(s)) return 'turmas';
  if (/matr[ií]cul/.test(s)) return 'matriculas';
  return null;
}

function dimForSubject(subject) {
  if (subject === 'turmas') return 'etapa_turma';
  if (subject === 'matriculas') return 'etapa_matricula';
  return null;
}

function metricForSubject(subject, question) {
  if (subject === 'turmas') return 'total_turmas';
  if (subject === 'matriculas') return inferMetricFromQuestion(question) || 'total_matriculas';
  return inferMetricFromQuestion(question);
}

function matchEtapaOptions(availableFilters, dim, etapaBase) {
  const arr = availableFilters && availableFilters[dim];
  if (!Array.isArray(arr) || arr.length === 0) return [];

  const baseN = normalizeLoose(etapaBase);
  if (!baseN) return [];

  const uniq = new Set();
  for (const v of arr) {
    const raw = String(v ?? '').trim();
    if (!raw) continue;
    const n = normalizeLoose(raw);
    if (n.startsWith(baseN)) uniq.add(raw);
  }
  return Array.from(uniq);
}

function includesOneOf(question, options) {
  const qn = normalizeLoose(question);
  for (const o of options) {
    if (qn.includes(normalizeLoose(o))) return o;
  }
  return null;
}

function buildEtapaClarify(subject, etapaBase, dim, options) {
  const subjLabel = subject === 'turmas' ? 'Turmas' : 'Matrículas';
  const baseLabel = etapaBase;
  const safeOpts = options.slice(0, 10);

  const lines = safeOpts.map((o) => `• ${o}`).join('\n');
  const msg =
    `Encontrei ${options.length} opções no banco para "${baseLabel}" em ${dim}.\n` +
    `Qual você quer?\n\n${lines}\n\n` +
    `Você também pode pedir:\n` +
    `• ${subjLabel} do ${baseLabel}: todas separadas\n` +
    `• ${subjLabel} do ${baseLabel}: somar todas`;

  const suggestions = [
    ...safeOpts.map((o) => `${subjLabel} do ${baseLabel}: ${o}`),
    `${subjLabel} do ${baseLabel}: todas separadas`,
    `${subjLabel} do ${baseLabel}: somar todas`,
  ].slice(0, 12);

  return {
    ok: false,
    kind: 'clarify',
    answer: msg,
    suggestions,
    spec: { type: 'clarify', subject, etapaBase, dim },
  };
}

function tryEtapaDisambiguation(question, availableFilters) {
  if (!availableFilters || typeof availableFilters !== 'object') return { handled: false };

  const subject = detectSubject(question);
  if (!subject) return { handled: false };

  const dim = dimForSubject(subject);
  if (!dim) return { handled: false };

  const qStr = String(question || '');
  const colonIdx = qStr.indexOf(':');
  const afterColon = colonIdx >= 0 ? qStr.slice(colonIdx + 1).trim() : '';
  const beforeColon = colonIdx >= 0 ? qStr.slice(0, colonIdx).trim() : qStr;

  const etapaBase = inferEtapaAnoFromQuestion(beforeColon) || inferEtapaAnoFromQuestion(qStr);
  if (!etapaBase) return { handled: false };

  const options = matchEtapaOptions(availableFilters, dim, etapaBase);
  if (!options.length) return { handled: false };

  const chosenInline = includesOneOf(qStr, options);
  const chosen = chosenInline || includesOneOf(afterColon, options);

  const metric = metricForSubject(subject, qStr);

  // 1) Se o usuário já citou explicitamente uma opção
  if (chosen) {
    return {
      handled: true,
      spec: {
        type: 'single',
        metric,
        where: { [dim]: chosen },
      },
    };
  }

  // 2) Ações (vindas por chip): "todas separadas" / "somar todas"
  const action = normalizeLoose(afterColon || qStr);

  if (action.includes('TODAS SEPARADAS') || action.includes('SEPARADAS')) {
    return {
      handled: true,
      spec: {
        type: 'breakdown',
        metric,
        groupBy: dim,
        order: 'desc',
        limit: Math.min(Math.max(options.length, 5), 50),
        // array -> runQuery transforma em WHERE ... = ANY($n::text[])
        where: { [dim]: options },
      },
    };
  }

  if (action.includes('SOMAR TODAS') || action.includes('SOMAR')) {
    return {
      handled: true,
      spec: {
        type: 'single',
        metric,
        // array -> runQuery transforma em WHERE ... = ANY($n::text[])
        where: { [dim]: options },
      },
    };
  }

  // 3) Se houver mais de 1 opção e nenhuma foi escolhida, pede clarificação
  if (options.length > 1) {
    return {
      handled: true,
      response: buildEtapaClarify(subject, etapaBase, dim, options),
    };
  }

  // 4) Apenas 1 opção: escolhe automaticamente
  return {
    handled: true,
    spec: {
      type: 'single',
      metric,
      where: { [dim]: options[0] },
    },
  };
}

function heuristicSpec(question) {
  const q = String(question || '').toLowerCase();

  // anos mencionados (um ou mais) — usado tanto em "turmas" quanto em outras métricas
  const years = [...q.matchAll(/\b(19\d{2}|20\d{2})\b/g)]
    .map((m) => Number(m[1]))
    .filter(Boolean);
  const uniqYears = Array.from(new Set(years)).slice(0, 3);

  const wantsCompare = /(compar|comparativo|comparar|diferen[cç]a|varia[cç][aã]o|delta|evolu|cres|aument|redu[cç][aã]o|queda|diminui)/.test(q);

  // se o usuário mencionar APENAS um ano (ex.: "em 2026"), aplicamos como filtro
  // para as consultas não-comparativas.
  const yearWhere = (!wantsCompare && uniqYears.length === 1)
    ? { ano_letivo: uniqYears[0] }
    : {};
  // =========================
  // TURMAS (métrica nova)
  // =========================
  if (/\bturmas?\b/.test(q)) {
    const metric = 'total_turmas';
    const groupBy = inferGroupByFromQuestion(q);
    const limit = Math.min(Math.max(parseLimitFromQuestion(q) || 20, 1), 50);
    const order = /(menor|menos|pior)/.test(q) ? 'asc' : 'desc';

    // "comparar turmas 2026 e 2025" (não deixar cair no fluxo de turmas simples)
    if (wantsCompare && uniqYears.length >= 2) {
      const baseYear = Math.min(uniqYears[0], uniqYears[1]);
      const compareYear = Math.max(uniqYears[0], uniqYears[1]);
      const direction = /(redu[cç][aã]o|queda|diminui)/.test(q)
        ? 'decrease'
        : (/(aument|cres|subiu)/.test(q) ? 'increase' : 'all');

      return {
        type: 'compare',
        metric,
        groupBy: groupBy || null,
        where: {},
        limit,
        compare: { baseYear, compareYear, direction },
      };
    }

    // tenta aplicar "1º ANO" etc.
    const etapa = inferEtapaAnoFromQuestion(q);
    const where = {};

    // se mencionar um ano específico (ex.: "turmas em 2026"), aplica como filtro
    if (!wantsCompare && uniqYears.length === 1) {
      where.ano_letivo = uniqYears[0];
    }
    if (etapa) {
      // para TURMAS, etapa mais fiel costuma ser etapa_turma
      where.etapa_turma = etapa;
    }

    // "turmas por etapa" -> breakdown em etapa_turma
    if (/por\s+etapa|por\s+ano|por\s+s[eé]rie/.test(q)) {
      return {
        type: 'breakdown',
        metric,
        groupBy: 'etapa_turma',
        where,
        limit,
        order,
      };
    }

    // ranking (por escola) ou "qual escola tem mais turmas"
    const wantsRanking = /(top|ranking|maior|menor|mais|menos|qual\s+escola)/.test(q);
    if (wantsRanking) {
      const by = groupBy || 'escola';
      const isSingle = /(\bqual\b|\bqual\s+é\b)/.test(q) && !/\btop\b/.test(q) && !/\b\d{1,2}\b/.test(q);
      return {
        type: 'breakdown',
        metric,
        groupBy: by,
        where,
        limit: isSingle ? 1 : Math.min(Math.max(parseLimitFromQuestion(q) || 10, 1), 50),
        order,
      };
    }

    // default: single
    return { type: 'single', metric, groupBy: null, where, limit: 20 };
  }

  if (wantsCompare && uniqYears.length >= 2) {
    const baseYear = Math.min(uniqYears[0], uniqYears[1]);
    const compareYear = Math.max(uniqYears[0], uniqYears[1]);
    const direction = /(redu[cç][aã]o|queda|diminui)/.test(q) ? 'decrease' : (/(aument|cres|subiu)/.test(q) ? 'increase' : 'all');
    const groupBy = inferGroupByFromQuestion(q);
    const metric = inferMetricFromQuestion(q);

    return {
      type: 'compare',
      metric,
      groupBy,
      where: {},
      limit: Math.min(Math.max(parseLimitFromQuestion(q) || 20, 1), 50),
      compare: { baseYear, compareYear, direction },
    };
  }

  // pedidos "por X"
  const by = inferGroupByFromQuestion(q);
  if (/\bpor\b/.test(q) && by) {
    return {
      type: 'breakdown',
      metric: inferMetricFromQuestion(q),
      groupBy: by,
      where: yearWhere,
      limit: Math.min(Math.max(parseLimitFromQuestion(q) || 20, 1), 50),
      order: 'desc',
    };
  }

  // "qual escola tem mais", "top", "maior", "ranking"...
  const wantsRanking = /(top|ranking|maior|menor|mais\s+alun|menos\s+alun|lidera|pior|melhor)/.test(q);
  if (wantsRanking) {
    const metric = inferMetricFromQuestion(q);
    const groupBy = by || 'escola';
    const limit = Math.min(Math.max(parseLimitFromQuestion(q) || 10, 1), 50);
    const order = /(menor|menos|pior)/.test(q) ? 'asc' : 'desc';

    // se for "qual" sem número, tende a ser 1 resultado
    const isSingle = /(\bqual\b|\bqual\s+é\b)/.test(q) && !/\btop\b/.test(q) && !/\b\d{1,2}\b/.test(q);

    return {
      type: 'breakdown',
      metric,
      groupBy,
      where: yearWhere,
      limit: isSingle ? 1 : limit,
      order,
    };
  }

  // single (um número)
  if (/taxa\s+de\s+evas[aã]o|evas[aã]o/.test(q)) return { type: 'single', metric: 'taxa_evasao', groupBy: null, where: yearWhere, limit: 20 };
  if (/matr[ií]culas\s+ativas|ativas/.test(q)) return { type: 'single', metric: 'matriculas_ativas', groupBy: null, where: yearWhere, limit: 20 };
  if (/total\s+de\s+matr[ií]culas|total\s+matr[ií]culas|quantas\s+matr[ií]culas/.test(q)) return { type: 'single', metric: 'total_matriculas', groupBy: null, where: yearWhere, limit: 20 };

  return null;
}

async function deepseekToSpec(question, context, history, domainOptions) {
  // Cache pequeno por (pergunta+context) para economizar tokens
  const cacheKey = `ai_spec_${Buffer.from(JSON.stringify({ question, context, history: String(history || '').slice(0, 400), domainOptions: String(domainOptions || '').slice(0, 400) })).toString('base64').slice(0, 120)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  if (!DEEPSEEK_API_KEY) {
    return {
      type: 'error',
      message: 'DEEPSEEK_API_KEY não configurada no backend.'
    };
  }

  const system = `Você é um tradutor de perguntas em linguagem natural para uma CONSULTA ESTRUTURADA (JSON) sobre dados do dashboard escolar (matrículas, turmas e escolas).
Regras:
- Responda SOMENTE com JSON válido (sem texto fora do JSON).
- Nunca peça ou retorne dados pessoais (nome de aluno, CPF, etc.).
- Use apenas estas métricas: ${Object.keys(ALLOWED_METRICS).join(', ')}.
- Use apenas estas dimensões para agrupamento: ${Object.keys(ALLOWED_DIMENSIONS).join(', ')}.
- Valores permitidos (domínio) para filtros no WHERE (quando você usar where):
${domainOptions ? domainOptions : '- (não informado)'}
- Use APENAS estes valores para os filtros no WHERE. Se o usuário pedir um valor que não exista na lista acima, retorne {"type":"unsupported","reason":"valor de filtro fora do domínio"}.
- Se a pergunta não puder ser atendida com segurança, retorne {"type":"unsupported","reason":"..."}.

Mapeamentos importantes:
- "turma(s)" => métrica total_turmas (usa idturma distinto).
- "quantas escolas" / "total de escolas" => métrica total_escolas.
- "1º ano", "1 ano", "primeiro ano" => normalmente corresponde a etapa_turma = "1º ANO" (para turmas) e/ou etapa_matricula (para matrículas).

Formato:
{
  "type": "single" | "breakdown" | "compare" | "unsupported",
  "metric": "total_matriculas" | "matriculas_ativas" | "desistentes" | "taxa_evasao" | "total_turmas" | "total_escolas",
  "groupBy": "<dimension>" | null,
  "where": { "<dimension>": "<value>", ... },
  "limit": 20,
  "order": "desc" | "asc",
  "compare": { "baseYear": 2025, "compareYear": 2026, "direction": "decrease" | "increase" | "all" }
}

Notas:
- Se a pergunta pedir "por" alguma dimensão (ex.: por sexo/turno), use type="breakdown" e groupBy.
- Se pedir "qual/onde tem mais/maior/top" para uma dimensão (ex.: "qual escola tem mais alunos"), use type="breakdown" com groupBy adequado, limit=1 (ou top N), e order="desc".
- Se pedir "menor/menos", use order="asc".
- Se pedir apenas um número, use type="single" e groupBy=null.
- Se pedir comparativo entre anos (ex.: "2026 vs 2025"), use type="compare" e preencha compare.baseYear e compare.compareYear.
- Em comparativos, groupBy pode ser null (comparativo geral) OU uma dimensão (ex.: por escola) para encontrar onde aumentou/reduziu.
- where deve incluir apenas filtros adicionais; o contexto já traz filtros selecionados.`;

  const user = `Histórico recente (últimas mensagens):\n${history ? history : '(sem histórico)'}

Pergunta atual: ${question}

Contexto atual (filtros já aplicados pelo usuário): ${JSON.stringify(context || {})}`;

  // DeepSeek às vezes pode retornar body vazio em cenários de erro/timeout.
  // Se a gente chamar resp.json() diretamente, pode estourar:
  // "Unexpected end of JSON input".
  const controller = new AbortController();
  const timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS || 25000);
  const t = setTimeout(() => controller.abort(), timeoutMs);

  let resp;
  let text = '';
  try {
    resp = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
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
      signal: controller.signal,
    });

    // sempre lê como texto primeiro para tratar body vazio
    text = await resp.text();
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error(`Timeout ao chamar DeepSeek (>${timeoutMs}ms).`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }

  // tratamento consistente de erros de upstream
  if (!resp?.ok) {
    let details = text;
    // tenta extrair mensagem de erro caso venha JSON
    try {
      const j = text ? JSON.parse(text) : null;
      details = j?.error?.message || j?.message || j?.error || details;
    } catch (_) {}
    const msg = `DeepSeek respondeu HTTP ${resp?.status || '???'}${details ? `: ${String(details).slice(0, 300)}` : ''}`;
    throw new Error(msg);
  }

  if (!text || !String(text).trim()) {
    throw new Error('DeepSeek retornou resposta vazia.');
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`DeepSeek retornou JSON inválido: ${String(e?.message || e).slice(0, 120)}`);
  }

  const content = json?.choices?.[0]?.message?.content;

  let spec = extractJsonMaybe(content);
  if (!spec) spec = { type: 'unsupported', reason: 'A IA não retornou JSON válido.' };

  cache.set(cacheKey, spec);
  return spec;
}

// (removido: havia uma segunda heuristicSpec duplicada que sobrescrevia a primeira)

function mergeFilters(contextFilters, whereFromLLM) {
  const merged = { ...(contextFilters || {}) };
  const where = whereFromLLM || {};

  for (const [k, v] of Object.entries(where)) {
    if (!ALLOWED_DIMENSIONS[k]) continue;
    if (v === undefined || v === null || v === '') continue;
    // mapeamento snake_case (LLM) -> camelCase (filtros do dashboard)
    const key =
      k === 'ano_letivo' ? 'anoLetivo' :
      k === 'situacao_matricula' ? 'situacaoMatricula' :
      k === 'grupo_etapa' ? 'grupoEtapa' :
      k === 'etapa_matricula' ? 'etapaMatricula' :
      k === 'etapa_turma' ? 'etapaTurma' :
      k === 'tipo_matricula' ? 'tipoMatricula' :
      k === 'tipo_transporte' ? 'tipoTransporte' :
      k === 'transporte_escolar' ? 'transporteEscolar' :
      k;
    merged[key] = v;
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

  // Em comparativos por ano, a gente NÃO prende o WHERE a um único ano_letivo.
  const normalizedForWhere = { ...normalizedFilters };

  // ARRAY_FILTER_SUPPORT_ETAPA
  // Suporte a filtro IN (ANY) para etapa_turma / etapa_matricula (usado no fluxo 'somar todas' / 'todas separadas')
  // Mantém SQL seguro: sempre parametrizado.
  const arrayFilters = {};
  if (Array.isArray(normalizedForWhere.etapaTurma)) {
    arrayFilters.etapa_turma = normalizedForWhere.etapaTurma;
    delete normalizedForWhere.etapaTurma;
  }
  if (Array.isArray(normalizedForWhere.etapa_turma)) {
    arrayFilters.etapa_turma = normalizedForWhere.etapa_turma;
    delete normalizedForWhere.etapa_turma;
  }
  if (Array.isArray(normalizedForWhere.etapaMatricula)) {
    arrayFilters.etapa_matricula = normalizedForWhere.etapaMatricula;
    delete normalizedForWhere.etapaMatricula;
  }
  if (Array.isArray(normalizedForWhere.etapa_matricula)) {
    arrayFilters.etapa_matricula = normalizedForWhere.etapa_matricula;
    delete normalizedForWhere.etapa_matricula;
  }
  if (spec.type === 'compare') {
    delete normalizedForWhere.anoLetivo;
    delete normalizedForWhere.ano_letivo;
  }

  const { clause, params } = buildWhereClause(normalizedForWhere, user);

  // ARRAY_FILTER_APPLIED_ETAPA
  let finalClause = clause;
  // etapa_turma IN (...)
  if (arrayFilters.etapa_turma && Array.isArray(arrayFilters.etapa_turma) && arrayFilters.etapa_turma.length) {
    params.push(arrayFilters.etapa_turma.map((x) => String(x)));
    finalClause += ` AND etapa_turma = ANY($${params.length}::text[])`;
  }
  // etapa_matricula IN (...)
  if (arrayFilters.etapa_matricula && Array.isArray(arrayFilters.etapa_matricula) && arrayFilters.etapa_matricula.length) {
    params.push(arrayFilters.etapa_matricula.map((x) => String(x)));
    finalClause += ` AND etapa_matricula = ANY($${params.length}::text[])`;
  }

  const base = `WITH base AS (
    SELECT * FROM dados_matriculas WHERE ${finalClause}
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
      ORDER BY value ${spec.order === 'asc' ? 'ASC' : 'DESC'}
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

    const limit = Math.min(Math.max(Number(spec.limit || 20), 1), 50);
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

    // Evita depender de alias em ORDER BY (alguns cenários/versões podem falhar)
    const orderBy =
      direction === 'decrease' ? `(${deltaExpr}) ASC` :
      direction === 'increase' ? `(${deltaExpr}) DESC` :
      `ABS(${deltaExpr}) DESC`;

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

function isSameActiveFilters(a, b) {
  // compara apenas chaves presentes em ambos; usado para evitar usar um snapshot
  // que não corresponde aos filtros enviados.
  const A = a || {};
  const B = b || {};
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const k of keys) {
    // normaliza undefined/null/'' como ''
    const va = A[k] ?? '';
    const vb = B[k] ?? '';
    if (String(va) !== String(vb)) return false;
  }
  return true;
}

function toRowsFromObject(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj)
    .map(([label, value]) => ({ label, value: Number(value) || 0 }))
    .sort((a, b) => (b.value || 0) - (a.value || 0));
}

function answerFromDashboardContext(question, dashboardContext) {
  const q = String(question || '').toLowerCase();
  const ctx = dashboardContext || {};
  const totals = ctx.totals || null;
  const available = ctx.availableFilters || null;
  const active = ctx.activeFilters || {};

  if (!totals) return null;

  // --- perguntas sobre catálogo de filtros ---
  if (available && /(quais|lista|mostrar).*(anos?|ano\s+letivo)/.test(q)) {
    const anos = Array.isArray(available?.ano_letivo) ? available.ano_letivo : [];
    if (anos.length) {
      return {
        ok: true,
        kind: 'ok',
        answer: `Anos letivos disponíveis: ${anos.join(', ')}.`,
        data: { years: anos },
        spec: { type: 'info', topic: 'ano_letivo' },
      };
    }
  }

  // --- última atualização ---
  if (/atuali[sz]a/.test(q) && /ultima|última|data|hora/.test(q)) {
    if (totals.ultimaAtualizacao) {
      return {
        ok: true,
        answer: `Última atualização: ${new Date(totals.ultimaAtualizacao).toLocaleString('pt-BR')}`,
        data: { ultimaAtualizacao: totals.ultimaAtualizacao },
        spec: { type: 'single', metric: 'ultimaAtualizacao' },
      };
    }
  }

  // --- respostas diretas (totais) ---
  if (/\bturmas?\b/.test(q) && !/por\s+escola|por\s+etapa|detalh|rank|top|lista/.test(q)) {
    const v = totals.totalTurmas ?? totals.total_turmas;
    if (v !== undefined && v !== null) {
      return {
        ok: true,
        answer: `Total de turmas: ${formatPtBRNumber(v)}`,
        data: { value: Number(v) || 0 },
        spec: { type: 'single', metric: 'total_turmas' },
      };
    }
  }

  if (/\bescolas?\b/.test(q) && !/por\s+zona|por\s+escola|rank|top|lista/.test(q)) {
    const v = totals.totalEscolas ?? totals.total_escolas;
    if (v !== undefined && v !== null) {
      return {
        ok: true,
        answer: `Total de escolas: ${formatPtBRNumber(v)}`,
        data: { value: Number(v) || 0 },
        spec: { type: 'single', metric: 'total_escolas' },
      };
    }
  }

  if (/matr[ií]cul/.test(q) && !/por\s+/.test(q) && !/rank|top|lista/.test(q)) {
    // tenta diferenciar ativas
    const wantsAtivas = /ativas|ativos|ativo|ativa/.test(q);
    const v = wantsAtivas
      ? (totals.totalMatriculasAtivas ?? totals.matriculasAtivas ?? totals.totalMatriculas)
      : (totals.totalMatriculas ?? totals.total_matriculas);
    if (v !== undefined && v !== null) {
      const label = wantsAtivas ? 'Matrículas ativas' : 'Total de matrículas';
      return {
        ok: true,
        answer: `${label}: ${formatPtBRNumber(v)}`,
        data: { value: Number(v) || 0 },
        spec: { type: 'single', metric: wantsAtivas ? 'matriculas_ativas' : 'total_matriculas' },
      };
    }
  }

  // --- breakdowns que já existem no payload do dashboard ---
  if (/por\s+sexo|sexo/.test(q)) {
    const rows = toRowsFromObject(totals.matriculasPorSexo);
    if (rows.length) {
      return {
        ok: true,
        answer: 'Matrículas por sexo',
        data: { rows, groupBy: 'sexo', metric: 'total_matriculas' },
        spec: { type: 'breakdown', metric: 'total_matriculas', groupBy: 'sexo' },
      };
    }
  }

  if (/por\s+turno|turno|manha|manhã|tarde|noite|integral/.test(q)) {
    const rows = toRowsFromObject(totals.matriculasPorTurno);
    if (rows.length) {
      return {
        ok: true,
        answer: 'Matrículas por turno',
        data: { rows, groupBy: 'turno', metric: 'total_matriculas' },
        spec: { type: 'breakdown', metric: 'total_matriculas', groupBy: 'turno' },
      };
    }
  }

  if (/por\s+situa|situa[cç][aã]o\s+da\s+matr[ií]cula|ativos|cancel|desistent|transfer/.test(q)) {
    const rows = toRowsFromObject(totals.matriculasPorSituacao);
    if (rows.length) {
      return {
        ok: true,
        answer: 'Matrículas por situação',
        data: { rows, groupBy: 'situacao_matricula', metric: 'total_matriculas' },
        spec: { type: 'breakdown', metric: 'total_matriculas', groupBy: 'situacao_matricula' },
      };
    }
  }

  if (/por\s+zona|zona\s+urb|zona\s+rur|urbana|rural/.test(q)) {
    // tenta descobrir se o usuário quer turmas, escolas, vagas/capacidade ou matrículas
    if (/\bturmas?\b/.test(q) && totals.turmasPorZona) {
      const rows = toRowsFromObject(totals.turmasPorZona);
      if (rows.length) {
        return {
          ok: true,
          answer: 'Turmas por zona',
          data: { rows, groupBy: 'zona_escola', metric: 'total_turmas' },
          spec: { type: 'breakdown', metric: 'total_turmas', groupBy: 'zona_escola' },
        };
      }
    }
    if (/\bescolas?\b/.test(q) && totals.escolasPorZona) {
      const rows = toRowsFromObject(totals.escolasPorZona);
      if (rows.length) {
        return {
          ok: true,
          answer: 'Escolas por zona',
          data: { rows, groupBy: 'zona_escola', metric: 'total_escolas' },
          spec: { type: 'breakdown', metric: 'total_escolas', groupBy: 'zona_escola' },
        };
      }
    }
    if (totals.matriculasPorZona) {
      const rows = toRowsFromObject(totals.matriculasPorZona);
      if (rows.length) {
        return {
          ok: true,
          answer: 'Matrículas por zona',
          data: { rows, groupBy: 'zona_aluno', metric: 'total_matriculas' },
          spec: { type: 'breakdown', metric: 'total_matriculas', groupBy: 'zona_aluno' },
        };
      }
    }
  }

  // --- ranking por escola (com base no snapshot do mapa) ---
  if ((/qual\s+escola|quais\s+escolas|top\s*\d+\s+escolas|escolas\s+com\s+mais/.test(q)) && Array.isArray(totals.escolas)) {
    const wantsAtivos = /ativas|ativos|ativo|ativa/.test(q);
    const field = wantsAtivos ? 'ativos' : 'total';
    const limit = parseLimitFromQuestion(question) || 10;
    const rows = (totals.escolas || [])
      .map((e) => ({ label: e.nome || e.escola || String(e.idescola || ''), value: Number(e[field]) || 0 }))
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .slice(0, Math.min(Math.max(limit, 1), 50));

    if (rows.length) {
      const metric = wantsAtivos ? 'matriculas_ativas' : 'total_matriculas';
      const answer = rows.length === 1
        ? `Maior ${wantsAtivos ? 'nº de matrículas ativas' : 'nº de matrículas'}: ${rows[0].label} (${formatPtBRNumber(rows[0].value)})`
        : `${wantsAtivos ? 'Matrículas ativas' : 'Matrículas'} por escola (Top ${rows.length})`;

      return {
        ok: true,
        answer,
        data: { rows, groupBy: 'escola', metric },
        spec: { type: 'breakdown', metric, groupBy: 'escola', limit: rows.length, order: 'desc' },
      };
    }
  }

  // não consegui responder só com o snapshot
  return null;
}

const query = async (req, res) => {
  try {
    const question = sanitizeQuestion(req.body?.question);
    const contextFilters = req.body?.filters || {};
    const dashboardContext = req.body?.dashboardContext || null;
    const history = sanitizeHistory(req.body?.history);
    const domainOptions = formatDomainOptions(dashboardContext?.availableFilters);

    if (!question) {
      return res.status(400).json({ error: 'Informe uma pergunta.' });
    }

    let spec = null;

    // 0) Se o frontend mandou o snapshot do dashboard (totais + catálogo de filtros),
    // tentamos responder DIRETO pelo que o usuário está vendo (mais rápido e mais preciso
    // para perguntas sobre os cards/gráficos já carregados).
    if (dashboardContext?.totals && isSameActiveFilters(dashboardContext?.activeFilters, contextFilters)) {
      const ctxAnswer = answerFromDashboardContext(question, dashboardContext);
      if (ctxAnswer) {
        return res.json(ctxAnswer);
      }
    }
    // 1) heurística para comparativos (evita frustração e diminui dependência do LLM)
    const heur = heuristicSpec(question);
    if (heur?.type === 'compare' && (!heur.compare?.compareYear || !heur.compare?.baseYear)) {
      return res.json({
        ok: false,
        kind: 'clarify',
        answer: 'Para comparar, me diga os dois anos. Ex.: \"Comparar matrículas 2026 e 2025\".',
        suggestions: [
          'Comparar matrículas 2026 e 2025',
          'Comparar matrículas ativas 2026 e 2025 por escola',
        ],
      });
    }

    // ETAPA_DISAMBIGUATION_FLOW
    if (!spec && dashboardContext?.availableFilters) {
      const etapaFlow = tryEtapaDisambiguation(question, dashboardContext.availableFilters);
      if (etapaFlow?.handled) {
        if (etapaFlow.response) {
          return res.json(etapaFlow.response);
        }
        if (etapaFlow.spec) {
          spec = etapaFlow.spec;
        }
      }
    }

    spec = spec || heur || (await deepseekToSpec(question, contextFilters, history, domainOptions));

    if (spec?.type === 'error') {
      return res.status(500).json({ error: spec.message });
    }
    if (!spec || spec.type === 'unsupported') {
      const q = String(question || '').toLowerCase();
      const suggestions = [
        'Total de matrículas ativas',
        'Quantas turmas existem?',
        'Quantas turmas do 1º ANO?',
        'Turmas por etapa_turma',
        'Matrículas por turno',
        'Matrículas por sexo',
        'Comparar matrículas 2026 e 2025 por escola',
        'Comparar desistentes 2026 e 2025 por zona_escola',
      ];
      if (/escola|unidade|inep/.test(q)) {
        suggestions.unshift('Qual escola tem mais alunos ativos?', 'Top 10 escolas com mais matrículas');
      }
      if (/\bturmas?\b/.test(q)) {
        suggestions.unshift('Top 10 escolas com mais turmas', 'Quantas turmas do 1º ANO?');
      }
      if (/etapa|1º|2º|3º|4º|5º|6º|7º|8º|9º|ano\b/.test(q)) {
        suggestions.unshift('Matrículas ativas na etapa 1º ANO');
      }
      if (/\bturmas?\b/.test(q)) {
        suggestions.unshift('Quantas turmas do 1º ANO?', 'Top 10 escolas com mais turmas');
      }
      if (/situa|ativo|ativa|desistent|cancel/.test(q)) {
        suggestions.unshift('Matrículas ativas por situação de matrícula');
      }

      return res.json({
        ok: false,
        kind: 'clarify',
        answer: `Ainda não entendi totalmente, mas eu consigo responder agregados, rankings (ex.: qual escola tem mais alunos) e comparativos por ano — sempre sem dados pessoais.
      
      Me diga a métrica e como quer ver. Exemplos:
      - "Qual escola tem mais alunos ativos?"
      - "Top 10 escolas com mais matrículas"
      - "Matrículas por turno"
      - "Comparar matrículas 2026 e 2025 por escola"`,
        suggestions: Array.from(new Set(suggestions)).slice(0, 8),
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

    // sanity: order só é aceito em breakdown e apenas asc/desc
    if (spec?.order && !['asc','desc'].includes(String(spec.order))) {
      delete spec.order;
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
          answer: 'Para um comparativo, preciso dos dois anos. Ex.: "Comparar matrículas 2026 e 2025".',
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

      const groupTxt = result.groupBy.replace('_', ' ');
      let answer = `${metricLabel} por ${groupTxt}`;

      // Se for um "top 1" (ex.: "qual escola tem mais alunos"), devolve uma frase mais humana.
      if (rows.length === 1 && spec?.groupBy) {
        const v = rows[0].value;
        const vFmt = spec.metric === 'taxa_evasao' ? `${formatPtBRPercent(v)}%` : formatPtBRNumber(v);
        const isAsc = String(spec.order || 'desc') === 'asc';
        const lead = isAsc ? 'Menor' : 'Maior';
        answer = `${lead} ${metricLabel.toLowerCase()} em ${groupTxt}: ${rows[0].label} (${vFmt})`;
      }

      return res.json({
        ok: true,
        answer,
        data: { rows, groupBy: result.groupBy, metric: spec.metric },
        spec,
      });
    }

    if (result.kind === 'compare') {
      const baseYear = result.compare?.baseYear;
      const compareYear = result.compare?.compareYear;
      const metricLabel = ALLOWED_METRICS[spec.metric].label;
      const groupLabel = spec.groupBy ? ` por ${spec.groupBy.replace('_', ' ')}` : '';
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
