'use strict';

/**
 * aiController.js (Premium Agent - TOP)
 *
 * Segurança mantida:
 * - ALLOWED_DIMENSIONS + ALLOWED_METRICS (allow-lists)
 * - SQL parametrizado; nenhum SQL livre do usuário
 *
 * Premium:
 * - Conversa persistida (PostgreSQL)
 * - Diagnóstico conversacional para perguntas "por que"
 * - Entende comparação (2026 vs 2025) e lista de escolas
 * - Desambiguação de etapa (1º ANO urbano/rural/indígena...)
 */

const pool = require('../config/db');
const NodeCache = require('node-cache');
const { randomUUID } = require('crypto');
const { buildWhereClause } = require('./dashboardController');

const cache = new NodeCache({ stdTTL: 180, checkperiod: 60 });

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

// =========================
// Segurança: allow-lists
// =========================

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
    sql: 'COUNT(DISTINCT idmatricula)',
  },
  total_turmas: {
    label: 'Total de turmas',
    sql: `COUNT(DISTINCT CASE WHEN idturma IS NOT NULL AND idturma <> 0 THEN idturma END)`,
  },
  total_escolas: {
    label: 'Total de escolas',
    sql: `COUNT(DISTINCT CASE WHEN idescola IS NOT NULL AND idescola <> 0 THEN idescola END)`,
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

// =========================
// Conversas (PostgreSQL)
// =========================

let _aiTablesReady = false;

async function ensureAiMessageIdDefault() {
  // Garante que ai_message.id tem DEFAULT (evita erro null no Render com schema antigo)
  const col = await pool.query(
    `
    SELECT data_type, udt_name, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ai_message' AND column_name='id'
    `
  );

  if (col.rowCount === 0) return;
  const row = col.rows[0] || {};
  const dataType = String(row.data_type || '').toLowerCase();
  const udtName = String(row.udt_name || '').toLowerCase();
  const hasDefault = !!row.column_default;

  if (hasDefault) return;

  const isUuid = dataType === 'uuid' || udtName === 'uuid';
  if (isUuid) {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    await pool.query(`ALTER TABLE ai_message ALTER COLUMN id SET DEFAULT gen_random_uuid();`);
    return;
  }

  const isNumeric = ['integer', 'bigint', 'smallint'].includes(dataType) || ['int2', 'int4', 'int8'].includes(udtName);
  if (isNumeric) {
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS ai_message_id_seq;`);
    await pool.query(`ALTER TABLE ai_message ALTER COLUMN id SET DEFAULT nextval('ai_message_id_seq');`);
    return;
  }

  // Se for text, não dá pra default numérico; melhor deixar sem tocar.
}

async function ensureAiTables() {
  if (_aiTablesReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_conversation (
      id UUID PRIMARY KEY,
      idcliente BIGINT NOT NULL,
      user_id TEXT NULL,
      user_name TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ai_message (
      id BIGSERIAL PRIMARY KEY,
      conversation_id UUID NOT NULL REFERENCES ai_conversation(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant')),
      content TEXT NOT NULL,
      kind TEXT NULL,
      spec_json JSONB NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_ai_message_conv_created
      ON ai_message(conversation_id, created_at DESC);
  `);

  await ensureAiMessageIdDefault();

  _aiTablesReady = true;
}

function isUuid(v) {
  const s = String(v || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function safeTrim(v, max = 80) {
  return String(v || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, max);
}

function getIdentity(req) {
  const headerName = req.header('X-User-Name') || req.header('x-user-name');
  const bodyName = req.body?.clientUserName || req.body?.userName || req.body?.clientUser?.name || req.body?.clientUser?.nome;

  const userName = safeTrim(req.user?.nome || req.user?.name || bodyName || headerName || '', 80);

  return {
    idcliente: Number(req.user?.clientId || req.user?.idcliente || 0) || 0,
    userId: req.user?.id !== undefined && req.user?.id !== null ? safeTrim(req.user.id, 80) : null,
    userName: userName || null,
  };
}

async function getOrCreateConversation(conversationId, identity) {
  const id = conversationId && isUuid(conversationId) ? conversationId : randomUUID();
  const created = !(conversationId && isUuid(conversationId));

  if (created) {
    await pool.query(
      `INSERT INTO ai_conversation (id, idcliente, user_id, user_name)
       VALUES ($1,$2,$3,$4)`,
      [id, identity.idcliente, identity.userId, identity.userName]
    );
    return { id, created: true };
  }

  const r = await pool.query(
    `SELECT id FROM ai_conversation WHERE id=$1 AND idcliente=$2`,
    [id, identity.idcliente]
  );
  if (r.rowCount === 0) {
    const newId = randomUUID();
    await pool.query(
      `INSERT INTO ai_conversation (id, idcliente, user_id, user_name)
       VALUES ($1,$2,$3,$4)`,
      [newId, identity.idcliente, identity.userId, identity.userName]
    );
    return { id: newId, created: true };
  }

  if (identity.userName) {
    await pool.query(
      `UPDATE ai_conversation
       SET user_name = COALESCE(user_name, $2), updated_at=NOW()
       WHERE id=$1 AND idcliente=$3`,
      [id, identity.userName, identity.idcliente]
    );
  } else {
    await pool.query(
      `UPDATE ai_conversation SET updated_at=NOW() WHERE id=$1 AND idcliente=$2`,
      [id, identity.idcliente]
    );
  }

  return { id, created: false };
}

async function saveMessage(conversationId, role, content, kind = null, spec = null) {
  await pool.query(
    `INSERT INTO ai_message (conversation_id, role, content, kind, spec_json)
     VALUES ($1,$2,$3,$4,$5)`,
    [conversationId, role, String(content || ''), kind, spec ? JSON.stringify(spec) : null]
  );
}

async function loadRecentMessages(conversationId, limit = 8) {
  const r = await pool.query(
    `SELECT role, content
     FROM ai_message
     WHERE conversation_id=$1
     ORDER BY created_at DESC
     LIMIT $2`,
    [conversationId, Math.min(Math.max(Number(limit) || 8, 1), 30)]
  );
  return (r.rows || []).reverse();
}

function buildHistoryString(messages, maxPairs = 4) {
  const rows = Array.isArray(messages) ? messages.slice(-maxPairs * 2) : [];
  return rows
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '').trim().slice(0, 400)}`)
    .join('\n');
}

// =========================
// Helpers de domínio (evita alucinação)
// =========================

function formatDomainOptions(availableFilters) {
  if (!availableFilters || typeof availableFilters !== 'object') return '';

  const lines = [];
  for (const dim of Object.keys(ALLOWED_DIMENSIONS)) {
    const arr = availableFilters?.[dim];
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const uniq = Array.from(new Set(arr.map((x) => String(x))));
    const shown = uniq.slice(0, 25);
    const suffix = uniq.length > shown.length ? ` ... (+${uniq.length - shown.length})` : '';
    lines.push(`- ${dim}: [${shown.join(', ')}]${suffix}`);
  }
  return lines.join('\n');
}

function normalizeText(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function inferEtapaAnoFromQuestion(q) {
  const s = String(q || '').toLowerCase();
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

function inferMetricFromQuestion(q) {
  const s = String(q || '').toLowerCase();

  // "alunos" = contagem agregada de matrículas (sem PII)
  if (/\balunos?\b/.test(s) || /n[uú]mero\s+de\s+alunos?/.test(s)) return 'total_matriculas';

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
  if (/por\s+turno|turnos|manha|manhã|tarde|noite|integral/.test(s)) return 'turno';
  if (/por\s+sexo|mascul|femin|sexo/.test(s)) return 'sexo';
  if (/por\s+situ[aã]c|situa[cç][aã]o\s+da\s+matr[ií]cula/.test(s)) return 'situacao_matricula';
  if (/zona\s+escola|por\s+zona\s+da\s+escola/.test(s)) return 'zona_escola';
  if (/zona\s+aluno|por\s+zona\s+do\s+aluno/.test(s)) return 'zona_aluno';
  if (/etapa\s+turma|por\s+etapa\s+da\s+turma|por\s+etapa\s+turma/.test(s)) return 'etapa_turma';
  if (/\betapa\b|por\s+etapa/.test(s)) return 'etapa_matricula';
  if (/grupo\s+etapa|por\s+grupo\s+etapa/.test(s)) return 'grupo_etapa';
  if (/tipo\s+matr[ií]cula|por\s+tipo\s+de\s+matr[ií]cula/.test(s)) return 'tipo_matricula';
  if (/defici[eê]ncia|por\s+defici[eê]ncia/.test(s)) return 'deficiencia';
  return null;
}

function parseLimitFromQuestion(question) {
  const q = String(question || '').toLowerCase();
  const m1 = q.match(/\btop\s*-?\s*(\d{1,2})\b/);
  if (m1) return Math.min(Math.max(parseInt(m1[1], 10) || 10, 1), 50);
  const m2 = q.match(/\b(\d{1,2})\s*(primeir|maior|menor)\w*\b/);
  if (m2) return Math.min(Math.max(parseInt(m2[1], 10) || 10, 1), 50);
  return null;
}

function extractJsonMaybe(content) {
  const raw = String(content || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {}

  const m = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (m?.[1]) {
    try {
      return JSON.parse(m[1]);
    } catch (_) {}
  }

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

function chooseEtapaDimension(metricKey, question) {
  const q = String(question || '').toLowerCase();
  if (/\bturmas?\b/.test(q) || metricKey === 'total_turmas') return 'etapa_turma';
  if (/matr[ií]cul/.test(q) || ['total_matriculas', 'matriculas_ativas', 'desistentes'].includes(metricKey)) return 'etapa_matricula';
  return metricKey === 'total_turmas' ? 'etapa_turma' : 'etapa_matricula';
}

function findMatchingOptions(options, baseToken) {
  const base = normalizeText(baseToken);
  const out = [];
  for (const opt of options || []) {
    const txt = normalizeText(opt);
    if (txt.includes(base)) out.push(String(opt));
  }
  return Array.from(new Set(out));
}

function buildDisambiguationResponse({ identity, metricLabel, etapaBase, dimension, matches }) {
  const namePrefix = identity?.userName ? `${identity.userName}, ` : '';
  const dimHuman = dimension === 'etapa_turma' ? 'etapa da turma (etapa_turma)' : 'etapa da matrícula (etapa_matricula)';
  const shown = matches.slice(0, 12);
  const more = matches.length > shown.length ? `\n(+${matches.length - shown.length} opções)` : '';

  const optionsText = shown.map((x, i) => `${i + 1}) ${x}`).join('\n');
  const suggestions = [
    `Separar ${metricLabel.toLowerCase()} por opções do ${etapaBase}`,
    `Somar todas as opções do ${etapaBase}`,
    ...shown.map((x) => `Usar: ${x}`),
  ].slice(0, 8);

  return {
    ok: false,
    kind: 'disambiguation',
    answer:
      `${namePrefix}encontrei mais de uma opção para **${etapaBase}** em **${dimHuman}**.\n\n` +
      `O que você quer?\n\n${optionsText}${more}`,
    suggestions,
    options: shown,
    clarify: {
      type: 'choose_etapa',
      base: etapaBase,
      dimension,
      matches: shown,
    },
  };
}

function extractYears(question) {
  const q = String(question || '');
  const years = [...q.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map((m) => Number(m[1])).filter(Boolean);
  return Array.from(new Set(years)).slice(0, 3);
}

function isCompareIntent(question) {
  const q = String(question || '').toLowerCase();
  return /(compar|comparativo|versus|\bvs\b|em\s+rela[cç][aã]o|rela[cç][aã]o\s+a|diferen[cç]a)/.test(q);
}

function isWhyQuestion(question) {
  const q = String(question || '').toLowerCase();
  return /\bpor\s+que\b|\bporque\b|\bmotivo\b|\braz[aã]o\b|\bcausa\b/.test(q);
}

function isListSchoolsQuestion(question) {
  const q = String(question || '').toLowerCase();
  return /quais\s+escolas|nome\s+das\s+escolas|lista\s+de\s+escolas|me\s+passe\s+o\s+nome\s+delas|nome\s+delas/.test(q);
}

// =========================
// Heurística (rápida) — sem LLM
// =========================

function heuristicSpec(question) {
  const q = String(question || '').toLowerCase();
  const years = [...q.matchAll(/\b(19\d{2}|20\d{2})\b/g)]
    .map((m) => Number(m[1]))
    .filter(Boolean);
  const uniqYears = Array.from(new Set(years)).slice(0, 3);
  const wantsCompare = isCompareIntent(question);
  const yearWhere = (!wantsCompare && uniqYears.length === 1) ? { ano_letivo: uniqYears[0] } : {};

  // TURMAS
  if (/\bturmas?\b/.test(q)) {
    const metric = 'total_turmas';
    const groupBy = inferGroupByFromQuestion(q);
    const limit = Math.min(Math.max(parseLimitFromQuestion(q) || 20, 1), 50);
    const order = /(menor|menos|pior)/.test(q) ? 'asc' : 'desc';

    if (wantsCompare && uniqYears.length >= 2) {
      const baseYear = Math.min(uniqYears[0], uniqYears[1]);
      const compareYear = Math.max(uniqYears[0], uniqYears[1]);
      const direction = /(redu[cç][aã]o|queda|diminui)/.test(q) ? 'decrease' : (/(aument|cres|subiu)/.test(q) ? 'increase' : 'all');
      return { type: 'compare', metric, groupBy: groupBy || null, where: {}, limit, compare: { baseYear, compareYear, direction } };
    }

    const etapaBase = inferEtapaAnoFromQuestion(q);
    const where = { ...yearWhere };
    if (etapaBase) where.etapa_turma = etapaBase;

    if (/por\s+etapa|por\s+ano|por\s+s[eé]rie/.test(q)) {
      return { type: 'breakdown', metric, groupBy: 'etapa_turma', where, limit, order };
    }

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

    return { type: 'single', metric, groupBy: null, where, limit: 20 };
  }

  // COMPARE (geral)
  if (wantsCompare && uniqYears.length >= 2) {
    const baseYear = Math.min(uniqYears[0], uniqYears[1]);
    const compareYear = Math.max(uniqYears[0], uniqYears[1]);
    const direction = /(redu[cç][aã]o|queda|diminui)/.test(q) ? 'decrease' : (/(aument|cres|subiu)/.test(q) ? 'increase' : 'all');
    const groupBy = inferGroupByFromQuestion(q);
    const metric = inferMetricFromQuestion(q);
    return { type: 'compare', metric, groupBy, where: {}, limit: Math.min(Math.max(parseLimitFromQuestion(q) || 20, 1), 50), compare: { baseYear, compareYear, direction } };
  }

  // BREAKDOWN
  const by = inferGroupByFromQuestion(q);
  if (/\bpor\b/.test(q) && by) {
    return { type: 'breakdown', metric: inferMetricFromQuestion(q), groupBy: by, where: yearWhere, limit: Math.min(Math.max(parseLimitFromQuestion(q) || 20, 1), 50), order: 'desc' };
  }

  // RANKING
  const wantsRanking = /(top|ranking|maior|menor|mais\s+alun|menos\s+alun|lidera|pior|melhor)/.test(q);
  if (wantsRanking) {
    const metric = inferMetricFromQuestion(q);
    const groupBy = by || 'escola';
    const limit = Math.min(Math.max(parseLimitFromQuestion(q) || 10, 1), 50);
    const order = /(menor|menos|pior)/.test(q) ? 'asc' : 'desc';
    const isSingle = /(\bqual\b|\bqual\s+é\b)/.test(q) && !/\btop\b/.test(q) && !/\b\d{1,2}\b/.test(q);
    return { type: 'breakdown', metric, groupBy, where: yearWhere, limit: isSingle ? 1 : limit, order };
  }

  // SINGLE
  if (/taxa\s+de\s+evas[aã]o|evas[aã]o/.test(q)) return { type: 'single', metric: 'taxa_evasao', groupBy: null, where: yearWhere, limit: 20 };
  if (/matr[ií]culas\s+ativas|ativas/.test(q)) return { type: 'single', metric: 'matriculas_ativas', groupBy: null, where: yearWhere, limit: 20 };
  if (/total\s+de\s+matr[ií]culas|total\s+matr[ií]culas|quantas\s+matr[ií]culas|\balunos?\b/.test(q)) return { type: 'single', metric: 'total_matriculas', groupBy: null, where: yearWhere, limit: 20 };

  return null;
}

// =========================
// DeepSeek: Text -> Spec (JSON)
// =========================

async function deepseekToSpec(question, contextFilters, historyString, domainOptionsString, identity) {
  const cacheKey = `ai_spec_${Buffer.from(JSON.stringify({ question, contextFilters, historyString, domainOptionsString })).toString('base64').slice(0, 160)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  if (!DEEPSEEK_API_KEY) {
    return { type: 'error', message: 'DEEPSEEK_API_KEY não configurada no backend.' };
  }

  const userNameLine = identity?.userName ? `O usuário se chama: ${identity.userName}. Responda como um analista humano, cordial e direto.` : 'Responda como um analista humano, cordial e direto.';

  const system = `Você é um tradutor de perguntas em linguagem natural para uma CONSULTA ESTRUTURADA (JSON) sobre dados do dashboard escolar.
${userNameLine}

Regras obrigatórias:
- Responda SOMENTE com JSON válido (sem texto fora do JSON).
- Nunca peça/retorne dados pessoais de ALUNOS (nome do aluno, CPF, identificadores individuais, etc.).
- Você PODE retornar nomes de ESCOLAS (instituições) e agregados por escola, desde que não identifique alunos.
- Use apenas estas métricas: ${Object.keys(ALLOWED_METRICS).join(', ')}.
- Use apenas estas dimensões: ${Object.keys(ALLOWED_DIMENSIONS).join(', ')}.
- Se não puder atender com segurança, retorne {"type":"unsupported","reason":"..."}.

Mapeamentos de negócio (muito importante):
- Quando a pergunta for sobre "turmas": use metric=total_turmas e, para filtrar por série/ano, use a coluna etapa_turma.
- Quando a pergunta for sobre "matrículas" (ou "alunos" como total): use metric total_matriculas/matriculas_ativas/desistentes e, para filtrar por série/ano, use a coluna etapa_matricula.
- Multisseriado pode fazer etapa_matricula diferente de etapa_turma; siga a regra acima conforme o tipo de pergunta.

Domínio (valores existentes no banco) — Use APENAS estes valores para filtros no WHERE:
${domainOptionsString || '(domínio não informado)'}

Formato:
{
  "type": "single" | "breakdown" | "compare" | "unsupported",
  "metric": "total_matriculas" | "matriculas_ativas" | "desistentes" | "taxa_evasao" | "total_turmas" | "total_escolas",
  "groupBy": "<dimension>" | null,
  "where": { "<dimension>": "<value>", ... },
  "limit": 20,
  "order": "desc" | "asc",
  "compare": { "baseYear": 2025, "compareYear": 2026, "direction": "decrease" | "increase" | "all" }
}`;

  const user = `Pergunta: ${question}

Histórico recente (para perguntas de continuação):
${historyString || '(sem histórico)'}

Contexto atual (filtros já aplicados pelo usuário): ${JSON.stringify(contextFilters || {})}`;

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

    text = await resp.text();
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error(`Timeout ao chamar DeepSeek (>${timeoutMs}ms).`);
    throw e;
  } finally {
    clearTimeout(t);
  }

  if (!resp?.ok) {
    let details = text;
    try {
      const j = text ? JSON.parse(text) : null;
      details = j?.error?.message || j?.message || j?.error || details;
    } catch (_) {}
    throw new Error(`DeepSeek respondeu HTTP ${resp?.status || '???'}${details ? `: ${String(details).slice(0, 300)}` : ''}`);
  }

  if (!text || !String(text).trim()) throw new Error('DeepSeek retornou resposta vazia.');

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

// =========================
// Execução SQL segura
// =========================

function metricSqlForYear(metricKey, yearParamRef) {
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

function mergeFilters(contextFilters, whereFromLLM) {
  const merged = { ...(contextFilters || {}) };
  const where = whereFromLLM || {};

  for (const [k, v] of Object.entries(where)) {
    if (!ALLOWED_DIMENSIONS[k]) continue;
    if (v === undefined || v === null || v === '') continue;
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
  const normalizedFilters = {
    ...mergedFilters,
    anoLetivo: mergedFilters.anoLetivo ?? mergedFilters.ano_letivo,
    situacaoMatricula: mergedFilters.situacaoMatricula ?? mergedFilters.situacao_matricula,
  };

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
    if (!sqlBase || !sqlComp) return { ok: false, message: 'Métrica não suportada para comparativo.' };

    const deltaExpr = `(${sqlComp}) - (${sqlBase})`;
    const pctExpr = `CASE WHEN (${sqlBase}) > 0 THEN ROUND((${deltaExpr}) * 100.0 / NULLIF((${sqlBase}),0), 2) ELSE NULL END`;
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
        rows: [{
          label: 'Geral',
          base_value: Number(row.base_value) || 0,
          compare_value: Number(row.compare_value) || 0,
          delta: Number(row.delta) || 0,
          pct_change: row.pct_change === null ? null : Number(row.pct_change),
        }],
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

// =========================
// Respostas rápidas via snapshot do dashboard
// =========================

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
  const A = a || {};
  const B = b || {};
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const k of keys) {
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

  if (!totals) return null;

  if (available && /(quais|lista|mostrar).*(anos?|ano\s+letivo)/.test(q)) {
    const anos = Array.isArray(available?.ano_letivo) ? available.ano_letivo : [];
    if (anos.length) {
      return { ok: true, kind: 'ok', answer: `Anos letivos disponíveis: ${anos.join(', ')}.`, data: { years: anos }, spec: { type: 'info', topic: 'ano_letivo' } };
    }
  }

  if (/atuali[sz]a/.test(q) && /ultima|última|data|hora/.test(q)) {
    if (totals.ultimaAtualizacao) {
      return { ok: true, answer: `Última atualização: ${new Date(totals.ultimaAtualizacao).toLocaleString('pt-BR')}`, data: { ultimaAtualizacao: totals.ultimaAtualizacao }, spec: { type: 'single', metric: 'ultimaAtualizacao' } };
    }
  }

  if (/\bturmas?\b/.test(q) && !/por\s+escola|por\s+etapa|detalh|rank|top|lista/.test(q)) {
    const v = totals.totalTurmas ?? totals.total_turmas;
    if (v !== undefined && v !== null) return { ok: true, answer: `Total de turmas: ${formatPtBRNumber(v)}`, data: { value: Number(v) || 0 }, spec: { type: 'single', metric: 'total_turmas' } };
  }

  if (/\bescolas?\b/.test(q) && !/por\s+zona|por\s+escola|rank|top|lista/.test(q)) {
    const v = totals.totalEscolas ?? totals.total_escolas;
    if (v !== undefined && v !== null) return { ok: true, answer: `Total de escolas: ${formatPtBRNumber(v)}`, data: { value: Number(v) || 0 }, spec: { type: 'single', metric: 'total_escolas' } };
  }

  if (/matr[ií]cul|\balunos?\b/.test(q) && !/por\s+/.test(q) && !/rank|top|lista/.test(q)) {
    const wantsAtivas = /ativas|ativos|ativo|ativa/.test(q);
    const v = wantsAtivas ? (totals.totalMatriculasAtivas ?? totals.matriculasAtivas ?? totals.totalMatriculas) : (totals.totalMatriculas ?? totals.total_matriculas);
    if (v !== undefined && v !== null) {
      const label = wantsAtivas ? 'Matrículas ativas' : 'Total de matrículas';
      return { ok: true, answer: `${label}: ${formatPtBRNumber(v)}`, data: { value: Number(v) || 0 }, spec: { type: 'single', metric: wantsAtivas ? 'matriculas_ativas' : 'total_matriculas' } };
    }
  }

  if (/por\s+sexo|sexo/.test(q)) {
    const rows = toRowsFromObject(totals.matriculasPorSexo);
    if (rows.length) return { ok: true, answer: 'Matrículas por sexo', data: { rows, groupBy: 'sexo', metric: 'total_matriculas' }, spec: { type: 'breakdown', metric: 'total_matriculas', groupBy: 'sexo' } };
  }

  if (/por\s+turno|turno|manha|manhã|tarde|noite|integral/.test(q)) {
    const rows = toRowsFromObject(totals.matriculasPorTurno);
    if (rows.length) return { ok: true, answer: 'Matrículas por turno', data: { rows, groupBy: 'turno', metric: 'total_matriculas' }, spec: { type: 'breakdown', metric: 'total_matriculas', groupBy: 'turno' } };
  }

  if (/por\s+situa|situa[cç][aã]o\s+da\s+matr[ií]cula|ativos|cancel|desistent|transfer/.test(q)) {
    const rows = toRowsFromObject(totals.matriculasPorSituacao);
    if (rows.length) return { ok: true, answer: 'Matrículas por situação', data: { rows, groupBy: 'situacao_matricula', metric: 'total_matriculas' }, spec: { type: 'breakdown', metric: 'total_matriculas', groupBy: 'situacao_matricula' } };
  }

  if (/por\s+zona|zona\s+urb|zona\s+rur|urbana|rural/.test(q)) {
    if (/\bturmas?\b/.test(q) && totals.turmasPorZona) {
      const rows = toRowsFromObject(totals.turmasPorZona);
      if (rows.length) return { ok: true, answer: 'Turmas por zona', data: { rows, groupBy: 'zona_escola', metric: 'total_turmas' }, spec: { type: 'breakdown', metric: 'total_turmas', groupBy: 'zona_escola' } };
    }
    if (/\bescolas?\b/.test(q) && totals.escolasPorZona) {
      const rows = toRowsFromObject(totals.escolasPorZona);
      if (rows.length) return { ok: true, answer: 'Escolas por zona', data: { rows, groupBy: 'zona_escola', metric: 'total_escolas' }, spec: { type: 'breakdown', metric: 'total_escolas', groupBy: 'zona_escola' } };
    }
    if (totals.matriculasPorZona) {
      const rows = toRowsFromObject(totals.matriculasPorZona);
      if (rows.length) return { ok: true, answer: 'Matrículas por zona', data: { rows, groupBy: 'zona_aluno', metric: 'total_matriculas' }, spec: { type: 'breakdown', metric: 'total_matriculas', groupBy: 'zona_aluno' } };
    }
  }

  // Top escolas já vem pronto no totals.escolas (snapshot)
  if ((/qual\s+escola|quais\s+escolas|top\s*\d+\s+escolas|escolas\s+com\s+mais|nome\s+delas/.test(q)) && Array.isArray(totals.escolas)) {
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

      return { ok: true, answer, data: { rows, groupBy: 'escola', metric }, spec: { type: 'breakdown', metric, groupBy: 'escola', limit: rows.length, order: 'desc' } };
    }
  }

  return null;
}

// =========================
// Seleção de desambiguação (sum/separate) com SQL seguro
// =========================

async function runEtapaSelectionMode({ mode, dimension, matches, metric, contextFilters, user }) {
  if (!mode || !dimension || !Array.isArray(matches) || matches.length === 0) {
    return { ok: false, message: 'Seleção inválida.' };
  }

  if (!ALLOWED_DIMENSIONS[dimension]) {
    return { ok: false, message: 'Dimensão inválida.' };
  }

  const metricDef = ALLOWED_METRICS[metric];
  if (!metricDef) {
    return { ok: false, message: 'Métrica inválida.' };
  }

  const dimCol = ALLOWED_DIMENSIONS[dimension].col;

  // base clause (filtros do dashboard + segurança multi-tenant via buildWhereClause)
  const mergedFilters = mergeFilters(contextFilters, {});
  const normalizedFilters = {
    ...mergedFilters,
    anoLetivo: mergedFilters.anoLetivo ?? mergedFilters.ano_letivo,
    situacaoMatricula: mergedFilters.situacaoMatricula ?? mergedFilters.situacao_matricula,
  };

  const { clause, params } = buildWhereClause(normalizedFilters, user);
  const pArr = `$${params.length + 1}`;
  const newParams = [...params, matches.map(String)];

  const base = `WITH base AS (
    SELECT * FROM dados_matriculas WHERE ${clause}
  ), base_sem_especiais AS (
    SELECT * FROM base WHERE COALESCE(idetapa_matricula,0) NOT IN (98,99)
  )`;

  if (mode === 'sum') {
    const sql = `${base}
      SELECT ${metricDef.sql} AS value
      FROM base_sem_especiais
      WHERE ${dimCol}::text = ANY(${pArr}::text[]);`;
    const result = await pool.query(sql, newParams);
    const value = result.rows?.[0]?.value ?? 0;
    return { ok: true, kind: 'single', value };
  }

  if (mode === 'separate') {
    const labelExpr = `COALESCE(${dimCol}::text, 'Sem informação')`;
    const sql = `${base}
      SELECT ${labelExpr} AS label, ${metricDef.sql} AS value
      FROM base_sem_especiais
      WHERE ${dimCol}::text = ANY(${pArr}::text[])
      GROUP BY ${labelExpr}
      ORDER BY value DESC
      LIMIT ${Math.min(matches.length, 50)};`;
    const result = await pool.query(sql, newParams);
    return { ok: true, kind: 'breakdown', rows: result.rows || [], groupBy: dimension };
  }

  return { ok: false, message: 'Modo inválido.' };
}

// =========================
// Handler
// =========================

const query = async (req, res) => {
  try {
    await ensureAiTables();

    const identity = getIdentity(req);
    const question = sanitizeQuestion(req.body?.question);
    const contextFilters = req.body?.filters || {};
    const dashboardContext = req.body?.dashboardContext || null;
    const availableFilters = dashboardContext?.availableFilters || null;
    const selection = req.body?.selection || null;

    if (!question) return res.status(400).json({ error: 'Informe uma pergunta.' });

    const { id: conversationId, created } = await getOrCreateConversation(req.body?.conversationId, identity);

    const recent = await loadRecentMessages(conversationId, 8);
    const historyString = buildHistoryString(recent, 4);

    await saveMessage(conversationId, 'user', question);

    // 0) Pergunta "por que" => modo diagnóstico (conversacional)
    if (isWhyQuestion(question)) {
      const namePrefix = identity.userName ? `${identity.userName}, ` : '';
      const resp = {
        ok: true,
        kind: 'analysis',
        answer:
          `${namePrefix}eu consigo te ajudar a descobrir o motivo, mas preciso investigar pelos dados. ` +
          `Geralmente “número baixo” em um ano acontece por: (1) ano ainda não consolidado, ` +
          `(2) muitos registros fora de ATIVO, (3) filtros aplicados, ` +
          `(4) entradas/saídas no período, ou (5) divergência por etapa/turno/zona.\n\n` +
          `Quer que eu verifique agora por onde está “faltando” matrícula?` ,
        suggestions: [
          'Comparar matrículas 2026 e 2025 por escola',
          'Comparar matrículas 2026 e 2025 por etapa',
          'Matrículas por situação',
          'Matrículas por turno',
        ],
        conversationId,
      };
      await saveMessage(conversationId, 'assistant', resp.answer, resp.kind, { type: 'diagnostic' });
      return res.json(resp);
    }

    // 1) Comparativo explícito (antes do snapshot)
    const years = extractYears(question);
    if (isCompareIntent(question) && years.length >= 2) {
      const baseYear = Math.min(years[0], years[1]);
      const compareYear = Math.max(years[0], years[1]);
      const metric = inferMetricFromQuestion(question);
      const groupBy = inferGroupByFromQuestion(question) || null;
      const spec = {
        type: 'compare',
        metric,
        groupBy,
        where: {},
        limit: Math.min(Math.max(parseLimitFromQuestion(question) || 20, 1), 50),
        compare: { baseYear, compareYear, direction: 'all' },
      };

      const result = await runQuery(spec, contextFilters, req.user);
      if (result.ok) {
        const namePrefix = identity.userName && created ? `${identity.userName}, ` : '';
        const metricLabel = ALLOWED_METRICS[metric].label;
        const groupLabel = groupBy ? ` por ${groupBy.replace('_', ' ')}` : '';
        const answer = `${namePrefix}${metricLabel}${groupLabel} — comparativo ${compareYear} vs ${baseYear}`;

        const payload = {
          ok: true,
          kind: 'compare',
          answer,
          data: { rows: result.rows, groupBy, metric, compare: result.compare },
          spec,
          conversationId,
        };
        await saveMessage(conversationId, 'assistant', payload.answer, 'compare', spec);
        return res.json(payload);
      }
    }

    // 2) Listar escolas (antes do snapshot)
    if (isListSchoolsQuestion(question)) {
      const metric = inferMetricFromQuestion(question);
      const spec = {
        type: 'breakdown',
        metric,
        groupBy: 'escola',
        where: {},
        limit: Math.min(Math.max(parseLimitFromQuestion(question) || 25, 1), 50),
        order: 'desc',
      };

      const result = await runQuery(spec, contextFilters, req.user);
      if (result.ok) {
        const rows = (result.rows || []).map((r) => ({ label: r.label, value: Number(r.value) || 0 }));
        const namePrefix = identity.userName && created ? `${identity.userName}, ` : '';
        const answer = `${namePrefix}${ALLOWED_METRICS[metric].label} por escola`;

        const payload = {
          ok: true,
          kind: 'breakdown',
          answer,
          data: { rows, groupBy: 'escola', metric },
          spec,
          conversationId,
        };
        await saveMessage(conversationId, 'assistant', payload.answer, 'breakdown', spec);
        return res.json(payload);
      }
    }

    // 3) Desambiguação de etapa (pré-spec)
    const metricGuess = inferMetricFromQuestion(question);
    const etapaBase = inferEtapaAnoFromQuestion(question);

    if (availableFilters && etapaBase && !selection) {
      const dim = chooseEtapaDimension(metricGuess, question);
      const options = Array.isArray(availableFilters?.[dim]) ? availableFilters[dim] : [];
      const matches = findMatchingOptions(options, etapaBase);

      if (matches.length > 1) {
        const resp = buildDisambiguationResponse({
          identity,
          metricLabel: ALLOWED_METRICS[metricGuess]?.label || 'resultado',
          etapaBase,
          dimension: dim,
          matches,
        });
        await saveMessage(conversationId, 'assistant', resp.answer, resp.kind, resp.clarify);
        return res.json({ ...resp, conversationId });
      }
    }

    // 4) Snapshot (somente quando não é compare/list/why)
    if (
      dashboardContext?.totals &&
      isSameActiveFilters(dashboardContext?.activeFilters, contextFilters)
    ) {
      const ctxAnswer = answerFromDashboardContext(question, dashboardContext);
      if (ctxAnswer) {
        const answer = identity.userName && created
          ? `${identity.userName}, ${ctxAnswer.answer}`
          : ctxAnswer.answer;
        const payload = { ...ctxAnswer, answer, conversationId };
        await saveMessage(conversationId, 'assistant', payload.answer, payload.kind || 'ok', payload.spec || null);
        return res.json(payload);
      }
    }

    // 5) Heurística + LLM
    const heur = heuristicSpec(question);
    const domainOptionsString = formatDomainOptions(availableFilters);
    const spec = heur || (await deepseekToSpec(question, contextFilters, historyString, domainOptionsString, identity));

    if (spec?.type === 'error') {
      await saveMessage(conversationId, 'assistant', spec.message, 'error', spec);
      return res.status(500).json({ error: spec.message, conversationId });
    }

    if (!spec || spec.type === 'unsupported') {
      const suggestions = [
        'Total de matrículas ativas',
        'Quantas turmas existem?',
        'Quantas turmas do 1º ANO?',
        'Turmas por etapa_turma',
        'Matrículas por turno',
        'Matrículas por sexo',
        'Comparar matrículas 2026 e 2025 por escola',
        'Matrículas por situação',
      ];
      const namePrefix = identity.userName ? `${identity.userName}, ` : '';
      const resp = {
        ok: false,
        kind: 'clarify',
        answer:
          `${namePrefix}eu consigo responder agregados, rankings e comparativos (por escola, turno, sexo, etapa, zona etc.). ` +
          `Eu não retorno dados pessoais de alunos.\n\n` +
          `Me diga a métrica e como quer ver. Exemplos:\n` +
          `- "Top 10 escolas com mais matrículas"\n` +
          `- "Matrículas por turno"\n` +
          `- "Comparar matrículas 2026 e 2025 por escola"`,
        suggestions: Array.from(new Set(suggestions)).slice(0, 8),
        spec,
        conversationId,
      };
      await saveMessage(conversationId, 'assistant', resp.answer, resp.kind, spec);
      return res.json(resp);
    }

    // 6) Aplicar seleção do frontend (desambiguação)
    if (selection?.mode && selection?.dimension && Array.isArray(selection?.matches)) {
      const metric = spec.metric || inferMetricFromQuestion(question);
      const result = await runEtapaSelectionMode({
        mode: String(selection.mode),
        dimension: String(selection.dimension),
        matches: selection.matches,
        metric,
        contextFilters,
        user: req.user,
      });

      if (!result.ok) {
        const resp = { ok: false, answer: result.message || 'Não consegui executar essa seleção.', conversationId };
        await saveMessage(conversationId, 'assistant', resp.answer, 'error', { selection, metric });
        return res.json(resp);
      }

      const metricLabel = ALLOWED_METRICS[metric].label;
      if (result.kind === 'single') {
        const vFmt = metric === 'taxa_evasao' ? `${formatPtBRPercent(result.value)}%` : formatPtBRNumber(result.value);
        const namePrefix = identity.userName && created ? `${identity.userName}, ` : '';
        const answer = `${namePrefix}${metricLabel}: ${vFmt}`;
        const payload = { ok: true, kind: 'single', answer, data: { value: result.value }, spec: { type: 'single', metric, selection }, conversationId };
        await saveMessage(conversationId, 'assistant', payload.answer, 'single', payload.spec);
        return res.json(payload);
      }

      if (result.kind === 'breakdown') {
        const rows = (result.rows || []).map((r) => ({ label: r.label, value: Number(r.value) || 0 }));
        const namePrefix = identity.userName && created ? `${identity.userName}, ` : '';
        const answer = `${namePrefix}${metricLabel} por ${String(selection.dimension).replace('_', ' ')}`;
        const payload = { ok: true, kind: 'breakdown', answer, data: { rows, groupBy: selection.dimension, metric }, spec: { type: 'breakdown', metric, groupBy: selection.dimension, selection }, conversationId };
        await saveMessage(conversationId, 'assistant', payload.answer, 'breakdown', payload.spec);
        return res.json(payload);
      }
    }

    if (selection?.dimension && selection?.value && ALLOWED_DIMENSIONS[selection.dimension]) {
      spec.where = { ...(spec.where || {}), [selection.dimension]: String(selection.value) };
    }

    // Validações finais
    if (!ALLOWED_METRICS[spec.metric]) {
      const resp = { ok: false, answer: 'Métrica não suportada nessa versão.', conversationId };
      await saveMessage(conversationId, 'assistant', resp.answer, 'error', spec);
      return res.json(resp);
    }
    if (spec.type === 'breakdown' && spec.groupBy && !ALLOWED_DIMENSIONS[spec.groupBy]) {
      const resp = { ok: false, answer: 'Dimensão de agrupamento não suportada nessa versão.', conversationId };
      await saveMessage(conversationId, 'assistant', resp.answer, 'error', spec);
      return res.json(resp);
    }
    if (spec?.order && !['asc', 'desc'].includes(String(spec.order))) delete spec.order;

    // Desambiguação pós-spec (quando IA retornou etapa base genérica)
    if (availableFilters) {
      const dim = chooseEtapaDimension(spec.metric, question);
      const etapaKey = dim === 'etapa_turma' ? 'etapa_turma' : 'etapa_matricula';
      const etapaValue = spec?.where?.[etapaKey];
      const base = etapaValue && /\b\dº\s+ANO\b/i.test(String(etapaValue)) ? String(etapaValue) : inferEtapaAnoFromQuestion(question);
      if (base && (!selection || !selection.value)) {
        const options = Array.isArray(availableFilters?.[dim]) ? availableFilters[dim] : [];
        const matches = findMatchingOptions(options, base);
        if (matches.length > 1 && (!etapaValue || normalizeText(etapaValue) === normalizeText(base))) {
          const resp = buildDisambiguationResponse({
            identity,
            metricLabel: ALLOWED_METRICS[spec.metric]?.label || 'resultado',
            etapaBase: base,
            dimension: dim,
            matches,
          });
          await saveMessage(conversationId, 'assistant', resp.answer, resp.kind, resp.clarify);
          return res.json({ ...resp, conversationId });
        }
        if (matches.length === 1 && ALLOWED_DIMENSIONS[etapaKey]) {
          spec.where = { ...(spec.where || {}), [etapaKey]: matches[0] };
        }
      }
    }

    const result = await runQuery(spec, contextFilters, req.user);
    if (!result.ok) {
      const resp = { ok: false, answer: result.message || 'Não consegui executar essa consulta.', conversationId };
      await saveMessage(conversationId, 'assistant', resp.answer, 'error', spec);
      return res.json(resp);
    }

    const metricLabel = ALLOWED_METRICS[spec.metric].label;

    if (result.kind === 'single') {
      const valueFmt = spec.metric === 'taxa_evasao' ? `${formatPtBRPercent(result.value)}%` : formatPtBRNumber(result.value);
      const answer = (identity.userName && created)
        ? `${identity.userName}, ${metricLabel}: ${valueFmt}`
        : `${metricLabel}: ${valueFmt}`;
      const payload = { ok: true, kind: 'single', answer, data: { value: result.value }, spec, conversationId };
      await saveMessage(conversationId, 'assistant', payload.answer, 'single', spec);
      return res.json(payload);
    }

    if (result.kind === 'breakdown') {
      const rows = (result.rows || []).map((r) => ({ label: r.label, value: Number(r.value) || 0 }));
      const groupTxt = String(result.groupBy || spec.groupBy || '').replace('_', ' ');
      let answer = `${metricLabel} por ${groupTxt}`;
      if (rows.length === 1 && spec?.groupBy) {
        const v = rows[0].value;
        const vFmt = spec.metric === 'taxa_evasao' ? `${formatPtBRPercent(v)}%` : formatPtBRNumber(v);
        const isAsc = String(spec.order || 'desc') === 'asc';
        const lead = isAsc ? 'Menor' : 'Maior';
        answer = `${lead} ${metricLabel.toLowerCase()} em ${groupTxt}: ${rows[0].label} (${vFmt})`;
      }
      if (identity.userName && created) answer = `${identity.userName}, ${answer}`;

      const payload = { ok: true, kind: 'breakdown', answer, data: { rows, groupBy: result.groupBy, metric: spec.metric }, spec, conversationId };
      await saveMessage(conversationId, 'assistant', payload.answer, 'breakdown', spec);
      return res.json(payload);
    }

    if (result.kind === 'compare') {
      const baseYear = result.compare?.baseYear;
      const compareYear = result.compare?.compareYear;
      const groupLabel = spec.groupBy ? ` por ${spec.groupBy.replace('_', ' ')}` : '';
      const dir = String(result.compare?.direction || 'all');
      const dirTxt = dir === 'decrease' ? 'redução' : dir === 'increase' ? 'aumento' : 'variação';
      let answer = `${metricLabel}${groupLabel} — comparativo ${compareYear} vs ${baseYear} (${dirTxt})`;
      if (identity.userName && created) answer = `${identity.userName}, ${answer}`;
      const payload = {
        ok: true,
        kind: 'compare',
        answer,
        data: { rows: result.rows, groupBy: spec.groupBy || null, metric: spec.metric, compare: result.compare },
        spec,
        conversationId,
      };
      await saveMessage(conversationId, 'assistant', payload.answer, 'compare', spec);
      return res.json(payload);
    }

    const fallback = { ok: false, answer: 'Consulta não suportada.', conversationId };
    await saveMessage(conversationId, 'assistant', fallback.answer, 'error', spec);
    return res.json(fallback);
  } catch (err) {
    console.error('[aiController] Erro:', err);
    return res.status(500).json({ error: 'Erro ao executar consulta IA', details: err.message });
  }
};

module.exports = { query };
