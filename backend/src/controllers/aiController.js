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
// Intenção: turmas cheias / sem vagas (capacidade)
// =========================

function wantsList(question) {
  const q = String(question || '').toLowerCase();
  return /(\bquais\b|\blista\b|\bmostrar\b|\bme\s+mostra\b|\bme\s+traz\b|\bme\s+passa\b|\bnomes\b|\bqual\s+sao\b)/.test(q);
}

function wantsCount(question) {
  const q = String(question || '').toLowerCase();
  return /(\bquantas\b|\bquantos\b|\btotal\b|\bn[uú]mero\b|\bqtd\b|\bconta\b|\bcontagem\b)/.test(q);
}

function detectTurmasVagasIntent(question) {
  const q = String(question || '').toLowerCase();
  if (!/\bturmas?\b/.test(q)) return null;

  const hasNoVagas = /(sem\s+vagas?|nao\s+tem\s+mais\s+vagas|n[aã]o\s+tem\s+vagas|0\s*vagas?|vagas?\s+zerad|esgotad|lotad[aо]?(?:\s+de\s+vagas)?)/.test(q);
  const hasCheia = /(chei[ao]|lotad[ao]|superlotad[ao])/.test(q);
  const hasExcedida = /(excedid|acima\s+da\s+capacidade|mais\s+alunos\s+que\s+a\s+capacidade|ocupac[aã]o\s*\>\s*100|\b100%\b)/.test(q);
  const hasQuase = /(quase\s+chei|poucas?\s+vagas|ultim(as|os)\s+vagas|restam\s+poucas?\s+vagas|at[eé]\s*\d+\s*vagas?)/.test(q);
  const mThreshold = q.match(/at[eé]\s*(\d{1,2})\s*vagas?/);
  const threshold = mThreshold ? Math.min(Math.max(parseInt(mThreshold[1], 10) || 1, 1), 20) : 5;

  // Alta confiança
  if (hasExcedida) return { kind: 'excedidas', confidence: 1.0 };
  if (hasNoVagas && !hasQuase) return { kind: 'sem_vagas', confidence: 1.0 };
  if (hasNoVagas && hasQuase) return { kind: 'quase_sem_vagas', threshold, confidence: 0.95 };
  if (hasQuase) return { kind: 'quase_sem_vagas', threshold, confidence: 0.9 };

  // Ambíguo: "turma cheia" pode significar sem vagas (=capacidade atingida) OU excedida (>capacidade)
  if (hasCheia) return { kind: 'ambiguous_cheia', confidence: 0.6 };

  return null;
}

function buildTurmasVagasDisambiguationResponse({ identity, question }) {
  const namePrefix = identity?.userName ? `${identity.userName}, ` : '';
  return {
    ok: false,
    kind: 'disambiguation',
    options: ['sem_vagas', 'excedidas', 'quase_sem_vagas'],
    answer:
      `${namePrefix}quando você diz **"turmas cheias"**, você quis dizer qual dessas opções?\n\n` +
      `1) **Sem vagas disponíveis** (vagas_disponiveis = 0 / capacidade atingida)\n` +
      `2) **Excedidas** (matrículas acima do limite / ocupação > 100%)\n` +
      `3) **Quase cheias** (ex.: até 5 vagas restantes)\n\n` +
      `Responda com **1**, **2** ou **3** (ou escreva: "sem vagas", "excedidas" ou "quase cheias").`,
    suggestions: [
      '1 (sem vagas)',
      '2 (excedidas)',
      '3 (quase cheias)',
      'Quais turmas sem vagas por escola?',
      'Quantas turmas sem vagas no ano 2026?',
    ],
    clarify: {
      type: 'choose_turmas_vagas',
      question: String(question || '').slice(0, 200),
      options: ['sem_vagas', 'excedidas', 'quase_sem_vagas'],
      defaultThreshold: 5,
    },
  };
}

async function runTurmasVagasQuery(spec, contextFilters, user) {
  // Segurança: allowlist de filtros e valores
  const allowedKinds = new Set(['sem_vagas', 'excedidas', 'quase_sem_vagas']);
  const kind = String(spec?.vagasKind || '').trim();
  if (!allowedKinds.has(kind)) return { ok: false, message: 'Filtro de vagas inválido.' };

  const threshold = Math.min(Math.max(Number(spec?.threshold ?? 5) || 5, 1), 20);
  const action = String(spec?.action || 'list');
  const limit = Math.min(Math.max(Number(spec?.limit ?? 30) || 30, 1), 100);

  const mergedFilters = mergeFilters(contextFilters, spec.where);
  const normalizedFilters = {
    ...mergedFilters,
    anoLetivo: mergedFilters.anoLetivo ?? mergedFilters.ano_letivo,
    situacaoMatricula: mergedFilters.situacaoMatricula ?? mergedFilters.situacao_matricula,
  };

  const { clause, params } = buildWhereClause(normalizedFilters, user);

  const base = `WITH base AS (
    SELECT * FROM dados_matriculas WHERE ${clause}
  ), base_sem_especiais AS (
    SELECT * FROM base WHERE COALESCE(idetapa_matricula,0) NOT IN (98,99)
  ), turmas_agg AS (
    SELECT
      idturma,
      MIN(COALESCE(turma::text, 'Sem informação')) AS turma,
      MIN(COALESCE(escola::text, 'Sem informação')) AS escola,
      MIN(COALESCE(idescola, 0)) AS idescola,
      MIN(COALESCE(etapa_turma::text, 'Sem informação')) AS etapa_turma,
      MIN(COALESCE(turno::text, 'Sem informação')) AS turno,
      MIN(COALESCE(zona_escola::text, 'Sem informação')) AS zona_escola,
      MAX(COALESCE(limite_maximo_aluno, 0)) AS capacidade,
      COUNT(DISTINCT CASE
        WHEN (UPPER(COALESCE(situacao_matricula,'')) IN ('ATIVO','ATIVA') OR COALESCE(idsituacao,0)=0)
        THEN idmatricula END
      ) AS matriculas_ativas
    FROM base_sem_especiais
    WHERE idturma IS NOT NULL AND idturma <> 0
    GROUP BY idturma
  ), turmas_calc AS (
    SELECT
      *,
      GREATEST(capacidade - matriculas_ativas, 0) AS vagas_disponiveis,
      CASE WHEN capacidade > 0 THEN ROUND((matriculas_ativas * 100.0) / capacidade, 2) ELSE NULL END AS taxa_ocupacao
    FROM turmas_agg
  )`;

  const whereFilter =
    kind === 'sem_vagas'
      ? `capacidade > 0 AND matriculas_ativas >= capacidade`
      : kind === 'excedidas'
        ? `capacidade > 0 AND matriculas_ativas > capacidade`
        : `capacidade > 0 AND vagas_disponiveis <= ${threshold}`;

  if (action === 'count') {
    const sql = `${base}
      SELECT COUNT(*)::int AS total
      FROM turmas_calc
      WHERE ${whereFilter};`;
    const r = await pool.query(sql, params);
    return { ok: true, kind: 'count', total: Number(r.rows?.[0]?.total) || 0 };
  }

  const sql = `${base}
    SELECT
      idturma,
      turma,
      escola,
      idescola,
      etapa_turma,
      turno,
      zona_escola,
      capacidade,
      matriculas_ativas,
      vagas_disponiveis,
      taxa_ocupacao
    FROM turmas_calc
    WHERE ${whereFilter}
    ORDER BY taxa_ocupacao DESC NULLS LAST, matriculas_ativas DESC
    LIMIT ${limit};`;

  const r = await pool.query(sql, params);
  const rows = (r.rows || []).map((x) => ({
    idturma: x.idturma,
    turma: x.turma,
    escola: x.escola,
    idescola: Number(x.idescola) || 0,
    etapa_turma: x.etapa_turma,
    turno: x.turno,
    zona_escola: x.zona_escola,
    capacidade: Number(x.capacidade) || 0,
    matriculas_ativas: Number(x.matriculas_ativas) || 0,
    vagas_disponiveis: Number(x.vagas_disponiveis) || 0,
    taxa_ocupacao: x.taxa_ocupacao === null ? null : Number(x.taxa_ocupacao),
  }));

  return { ok: true, kind: 'list', rows };
}



// =========================
// Intenção: escolas cheias / sem vagas (capacidade)
// =========================

function detectEscolasVagasIntent(question) {
  const q = String(question || '').toLowerCase();
  if (!/\bescolas?\b/.test(q)) return null;

  const hasNoVagas = /(sem\s+vagas?|nao\s+tem\s+mais\s+vagas|n[aã]o\s+tem\s+vagas|0\s*vagas?|vagas?\s+zerad|esgotad|lotad[aо]?(?:\s+de\s+vagas)?)/.test(q);
  const hasCheia = /(chei[ao]|lotad[ao]|superlotad[ao])/.test(q);
  const hasExcedida = /(excedid|acima\s+da\s+capacidade|ocupac[aã]o\s*\>\s*100|\b100%\b)/.test(q);
  const hasQuase = /(quase\s+chei|poucas?\s+vagas|ultim(as|os)\s+vagas|restam\s+poucas?\s+vagas|at[eé]\s*\d+\s*vagas?)/.test(q);
  const mThreshold = q.match(/at[eé]\s*(\d{1,2})\s*vagas?/);
  const threshold = mThreshold ? Math.min(Math.max(parseInt(mThreshold[1], 10) || 1, 1), 20) : 5;

  if (hasExcedida) return { kind: 'excedidas', confidence: 1.0 };
  if (hasNoVagas && !hasQuase) return { kind: 'sem_vagas', confidence: 1.0 };
  if (hasNoVagas && hasQuase) return { kind: 'quase_sem_vagas', threshold, confidence: 0.95 };
  if (hasQuase) return { kind: 'quase_sem_vagas', threshold, confidence: 0.9 };
  if (hasCheia) return { kind: 'ambiguous_cheia', confidence: 0.6 };
  return null;
}

function buildEscolasVagasDisambiguationResponse({ identity, question }) {
  const namePrefix = identity?.userName ? `${identity.userName}, ` : '';
  return {
    ok: false,
    kind: 'disambiguation',
    options: ['sem_vagas', 'excedidas', 'quase_sem_vagas'],
    answer:
      `${namePrefix}quando você diz **"escolas cheias"**, você quis dizer qual dessas opções?\n\n` +
      `1) **Sem vagas disponíveis** (soma das vagas = 0 / capacidade atingida)\n` +
      `2) **Excedidas** (matrículas acima do limite / ocupação > 100%)\n` +
      `3) **Quase cheias** (ex.: até 5 vagas restantes)\n\n` +
      `Responda com **1**, **2** ou **3** (ou escreva: "sem vagas", "excedidas" ou "quase cheias").`,
    suggestions: [
      '1 (sem vagas)',
      '2 (excedidas)',
      '3 (quase cheias)',
      'Quais escolas sem vagas no ano 2026?',
      'Top 10 escolas com mais vagas disponíveis',
    ],
    clarify: {
      type: 'choose_escolas_vagas',
      question: String(question || '').slice(0, 200),
      options: ['sem_vagas', 'excedidas', 'quase_sem_vagas'],
      defaultThreshold: 5,
    },
  };
}

async function runEscolasVagasQuery(spec, contextFilters, user) {
  const allowedKinds = new Set(['sem_vagas', 'excedidas', 'quase_sem_vagas']);
  const kind = String(spec?.vagasKind || '').trim();
  if (!allowedKinds.has(kind)) return { ok: false, message: 'Filtro de vagas inválido.' };

  const threshold = Math.min(Math.max(Number(spec?.threshold ?? 5) || 5, 1), 20);
  const action = String(spec?.action || 'list');
  const limit = Math.min(Math.max(Number(spec?.limit ?? 30) || 30, 1), 100);

  const mergedFilters = mergeFilters(contextFilters, spec.where);
  const normalizedFilters = {
    ...mergedFilters,
    anoLetivo: mergedFilters.anoLetivo ?? mergedFilters.ano_letivo,
    situacaoMatricula: mergedFilters.situacaoMatricula ?? mergedFilters.situacao_matricula,
  };

  const { clause, params } = buildWhereClause(normalizedFilters, user);

  const base = `WITH base AS (
    SELECT * FROM dados_matriculas WHERE ${clause}
  ), base_sem_especiais AS (
    SELECT * FROM base WHERE COALESCE(idetapa_matricula,0) NOT IN (98,99)
  ), turmas_dist AS (
    SELECT DISTINCT ON (idescola, idturma)
      idescola,
      COALESCE(escola::text, 'Sem informação') AS escola,
      COALESCE(zona_escola::text, 'Sem informação') AS zona_escola,
      idturma,
      MAX(COALESCE(limite_maximo_aluno, 0)) OVER (PARTITION BY idescola, idturma) AS capacidade_turma
    FROM base_sem_especiais
    WHERE idescola IS NOT NULL AND idescola <> 0 AND idturma IS NOT NULL AND idturma <> 0
    ORDER BY idescola, idturma
  ), escolas_cap AS (
    SELECT
      idescola,
      MIN(escola) AS escola,
      MIN(zona_escola) AS zona_escola,
      COUNT(DISTINCT idturma) AS total_turmas,
      COALESCE(SUM(capacidade_turma), 0) AS capacidade_total
    FROM turmas_dist
    GROUP BY idescola
  ), escolas_mat AS (
    SELECT
      idescola,
      COUNT(DISTINCT CASE
        WHEN (UPPER(COALESCE(situacao_matricula,'')) IN ('ATIVO','ATIVA') OR COALESCE(idsituacao,0)=0)
        THEN idmatricula END
      ) AS matriculas_ativas
    FROM base_sem_especiais
    WHERE idescola IS NOT NULL AND idescola <> 0
    GROUP BY idescola
  ), escolas_calc AS (
    SELECT
      c.idescola,
      c.escola,
      c.zona_escola,
      c.total_turmas,
      c.capacidade_total,
      COALESCE(m.matriculas_ativas, 0) AS matriculas_ativas,
      GREATEST(c.capacidade_total - COALESCE(m.matriculas_ativas, 0), 0) AS vagas_disponiveis,
      CASE WHEN c.capacidade_total > 0 THEN ROUND((COALESCE(m.matriculas_ativas, 0) * 100.0) / c.capacidade_total, 2) ELSE NULL END AS taxa_ocupacao
    FROM escolas_cap c
    LEFT JOIN escolas_mat m ON m.idescola = c.idescola
  )`;

  const whereFilter =
    kind === 'sem_vagas'
      ? `capacidade_total > 0 AND matriculas_ativas >= capacidade_total`
      : kind === 'excedidas'
        ? `capacidade_total > 0 AND matriculas_ativas > capacidade_total`
        : `capacidade_total > 0 AND vagas_disponiveis <= ${threshold}`;

  if (action === 'count') {
    const sql = `${base}
      SELECT COUNT(*)::int AS total
      FROM escolas_calc
      WHERE ${whereFilter};`;
    const r = await pool.query(sql, params);
    return { ok: true, kind: 'count', total: Number(r.rows?.[0]?.total) || 0 };
  }

  const order = String(spec?.order || '').toLowerCase();
  const orderBy = order === 'vagas_asc'
    ? `vagas_disponiveis ASC, taxa_ocupacao DESC NULLS LAST`
    : order === 'vagas_desc'
      ? `vagas_disponiveis DESC, taxa_ocupacao ASC NULLS LAST`
      : `taxa_ocupacao DESC NULLS LAST, matriculas_ativas DESC`;

  const sql = `${base}
    SELECT
      idescola,
      escola,
      zona_escola,
      total_turmas,
      capacidade_total,
      matriculas_ativas,
      vagas_disponiveis,
      taxa_ocupacao
    FROM escolas_calc
    WHERE ${whereFilter}
    ORDER BY ${orderBy}
    LIMIT ${limit};`;

  const r = await pool.query(sql, params);
  const rows = (r.rows || []).map((x) => ({
    idescola: Number(x.idescola) || 0,
    escola: x.escola,
    zona_escola: x.zona_escola,
    total_turmas: Number(x.total_turmas) || 0,
    capacidade_total: Number(x.capacidade_total) || 0,
    matriculas_ativas: Number(x.matriculas_ativas) || 0,
    vagas_disponiveis: Number(x.vagas_disponiveis) || 0,
    taxa_ocupacao: x.taxa_ocupacao === null ? null : Number(x.taxa_ocupacao),
  }));

  return { ok: true, kind: 'list', rows };
}
// =========================
// Heurística (rápida) — sem LLM
// =========================

function resolveCurrentYearFromContext(contextFilters, availableFilters) {
  const cf = contextFilters || {};
  const v = cf.anoLetivo ?? cf.ano_letivo;
  const n = Number(v);
  if (Number.isFinite(n) && n > 1900) return n;

  const anos = Array.isArray(availableFilters?.ano_letivo) ? availableFilters.ano_letivo : [];
  const years = anos.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 1900);
  if (years.length) return Math.max(...years);

  return new Date().getFullYear();
}

function resolveRelativeYearFromQuestion(qLower, currentYear) {
  const q = String(qLower || '').toLowerCase();
  const cy = Number(currentYear);
  if (!Number.isFinite(cy) || cy < 1900) return null;

  // ano passado / ano anterior
  if (/\bano\s+passado\b|\bno\s+ano\s+passado\b|\bano\s+anterior\b/.test(q)) return cy - 1;
  // ano retrasado
  if (/\bano\s+retrasado\b|\bpen[úu]ltimo\s+ano\b/.test(q)) return cy - 2;
  // ano atual
  if (/\beste\s+ano\b|\bnesse\s+ano\b|\bano\s+atual\b/.test(q)) return cy;

  return null;
}

function heuristicSpec(question, contextFilters, dashboardContext) {
  const q = String(question || '').toLowerCase();
  const years = [...q.matchAll(/\b(19\d{2}|20\d{2})\b/g)]
    .map((m) => Number(m[1]))
    .filter(Boolean);
  const uniqYears = Array.from(new Set(years)).slice(0, 3);
  const wantsCompare = isCompareIntent(question);

  // Ano de referência (importante para expressões como "ano passado")
  const availableFilters = dashboardContext?.availableFilters || null;
  const currentYear = resolveCurrentYearFromContext(contextFilters, availableFilters);
  const relativeYear = resolveRelativeYearFromQuestion(q, currentYear);

  const yearWhere = (!wantsCompare && uniqYears.length === 1)
    ? { ano_letivo: uniqYears[0] }
    : (!wantsCompare && Number.isFinite(Number(relativeYear)) ? { ano_letivo: Number(relativeYear) } : {});

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
  if (/desistent|aband|evad/.test(q)) return { type: 'single', metric: 'desistentes', groupBy: null, where: yearWhere, limit: 20 };
  if (/matr[ií]culas\s+ativas|ativas/.test(q)) return { type: 'single', metric: 'matriculas_ativas', groupBy: null, where: yearWhere, limit: 20 };
  if (/total\s+de\s+matr[ií]culas|total\s+matr[ií]culas|quantas\s+matr[ií]culas|\balunos?\b/.test(q)) return { type: 'single', metric: 'total_matriculas', groupBy: null, where: yearWhere, limit: 20 };

  return null;
}

// =========================
// DeepSeek: Text -> Spec (JSON)
// =========================

function summarizeDashboardContextForLLM(dashboardContext, contextFilters) {
  const ctx = dashboardContext || {};
  const totals = ctx.totals || {};
  const active = ctx.activeFilters || contextFilters || {};

  // Só inclui campos bem agregados (sem risco de PII) e limita tamanho
  const topObj = (obj, n=6) => {
    if (!obj || typeof obj !== 'object') return [];
    return Object.entries(obj)
      .map(([k, v]) => ({ k, v: Number(v) || 0 }))
      .sort((a, b) => (b.v || 0) - (a.v || 0))
      .slice(0, n);
  };

  const summary = {
    activeFilters: active,
    totals: {
      totalMatriculas: totals.totalMatriculas ?? totals.total_matriculas,
      totalMatriculasAtivas: totals.totalMatriculasAtivas ?? totals.matriculasAtivas ?? totals.total_matriculas_ativas,
      totalTurmas: totals.totalTurmas ?? totals.total_turmas,
      totalEscolas: totals.totalEscolas ?? totals.total_escolas,
      taxaEvasao: totals.taxaEvasao ?? totals.taxa_evasao,
      taxaOcupacao: totals.taxaOcupacao ?? totals.taxa_ocupacao,
      topSituacao: topObj(totals.matriculasPorSituacao),
      topTurno: topObj(totals.matriculasPorTurno),
      topSexo: topObj(totals.matriculasPorSexo),
    },
    availableYears: Array.isArray(ctx.availableFilters?.ano_letivo) ? ctx.availableFilters.ano_letivo : undefined,
  };

  let s = JSON.stringify(summary);
  if (s.length > 1800) s = s.slice(0, 1800) + '...';
  return s;
}

async function deepseekToSpec(question, contextFilters, historyString, domainOptionsString, identity, dashboardContext) {
  const dashSummary = summarizeDashboardContextForLLM(dashboardContext, contextFilters);
  const cacheKey = `ai_spec_${Buffer.from(JSON.stringify({ question, contextFilters, historyString, domainOptionsString, dashSummary })).toString('base64').slice(0, 160)}`;
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

Contexto atual (filtros já aplicados pelo usuário): ${JSON.stringify(contextFilters || {})}

Snapshot do dashboard (totais/infos já carregados para os filtros atuais):
${dashSummary || '(snapshot não informado)'}`;

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
      k === 'zona_escola' ? 'zonaEscola' :
      k === 'zona_aluno' ? 'zonaAluno' :
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

// =========================
// DeepSeek: reparo de spec (self-healing)
// =========================

async function deepseekRepairSpec({
  question,
  contextFilters,
  historyString,
  domainOptionsString,
  identity,
  dashboardContext,
  previousSpec,
  sqlError,
}) {
  if (!DEEPSEEK_API_KEY) return null;

  const userNameLine = identity?.userName
    ? `O usuário se chama: ${identity.userName}. Responda como um analista humano, cordial e direto.`
    : 'Responda como um analista humano, cordial e direto.';

  const system = `Você é um "corretor" de SPEC JSON para consultas agregadas do dashboard escolar.
${userNameLine}

Regras obrigatórias:
- Responda SOMENTE com JSON válido (sem texto fora do JSON).
- Nunca retorne dados pessoais de alunos.
- Use apenas estas métricas: ${Object.keys(ALLOWED_METRICS).join(', ')}.
- Use apenas estas dimensões: ${Object.keys(ALLOWED_DIMENSIONS).join(', ')}.
- Mantenha a MESMA intenção da pergunta do usuário, mas corrija o spec para evitar o erro do banco.

Domínio (valores existentes no banco) — Use APENAS estes valores para filtros no WHERE:
${domainOptionsString || '(domínio não informado)'}
`;

  const dashSummary = summarizeDashboardContextForLLM(dashboardContext, contextFilters);

  const user = `Pergunta original: ${question}

Histórico recente:
${historyString || '(sem histórico)'}

Contexto atual (filtros do dashboard): ${JSON.stringify(contextFilters || {})}

Snapshot do dashboard:
${dashSummary || '(snapshot não informado)'}

SPEC anterior (que gerou erro):
${JSON.stringify(previousSpec || {}, null, 2)}

Erro do PostgreSQL:
${JSON.stringify(sqlError || {}, null, 2)}

Me devolva um NOVO spec JSON corrigido.`;

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
        temperature: 0.0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: controller.signal,
    });
    text = await resp.text();
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error(`Timeout ao chamar DeepSeek (reparo) (>${timeoutMs}ms).`);
    throw e;
  } finally {
    clearTimeout(t);
  }

  if (!resp?.ok) return null;

  let json;
  try {
    json = JSON.parse(text);
  } catch (_) {
    return null;
  }

  const content = json?.choices?.[0]?.message?.content;
  const spec = extractJsonMaybe(content);
  if (!spec || typeof spec !== 'object') return null;
  return spec;
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

  // meta para insights e auditoria (sem PII)
  const effectiveYearRaw = normalizedForWhere.anoLetivo ?? normalizedForWhere.ano_letivo;
  const effectiveYear = effectiveYearRaw !== undefined && effectiveYearRaw !== null && effectiveYearRaw !== ''
    ? (parseInt(effectiveYearRaw, 10) || Number(effectiveYearRaw) || null)
    : null;

  // IMPORTANTE: se o usuário pediu AGRUPAMENTO por situação, não podemos herdar
  // o filtro padrão do dashboard (ex.: situacaoMatricula=ATIVO), senão ele
  // mascara as outras situações no GROUP BY.
  const wantsGroupSituacao = spec.type === 'breakdown' && spec.groupBy === 'situacao_matricula';
  const hasSituacaoInSpec = !!(spec?.where && (
    spec.where.situacao_matricula !== undefined && spec.where.situacao_matricula !== null && String(spec.where.situacao_matricula).trim() !== ''
  ));

  if (wantsGroupSituacao && !hasSituacaoInSpec) {
    delete normalizedForWhere.situacaoMatricula;
    delete normalizedForWhere.situacao_matricula;
  }

  // Se a métrica já é desistentes, também não faz sentido herdar filtro de situação
  // (a não ser que o usuário tenha pedido explicitamente).
  if (spec.metric === 'desistentes' && !hasSituacaoInSpec) {
    delete normalizedForWhere.situacaoMatricula;
    delete normalizedForWhere.situacao_matricula;
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
    try {
      const result = await pool.query(sql, params);
      const value = result.rows?.[0]?.value ?? 0;
      return { ok: true, kind: 'single', value, meta: { effectiveYear, usedFilters: normalizedForWhere } };
    } catch (e) {
      return {
        ok: false,
        message: 'Erro ao executar SQL (single).',
        sqlError: {
          message: e?.message,
          code: e?.code,
          detail: e?.detail,
          hint: e?.hint,
          where: e?.where,
        },
      };
    }
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
    try {
      const result = await pool.query(sql, params);
      return {
        ok: true,
        kind: 'breakdown',
        rows: result.rows || [],
        groupBy: spec.groupBy,
        meta: { effectiveYear, usedFilters: normalizedForWhere },
      };
    } catch (e) {
      return {
        ok: false,
        message: 'Erro ao executar SQL (breakdown).',
        sqlError: {
          message: e?.message,
          code: e?.code,
          detail: e?.detail,
          hint: e?.hint,
          where: e?.where,
        },
      };
    }
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
      let result;
      try {
        result = await pool.query(sql, newParams);
      } catch (e) {
        return {
          ok: false,
          message: 'Erro ao executar SQL (compare).',
          sqlError: {
            message: e?.message,
            code: e?.code,
            detail: e?.detail,
            hint: e?.hint,
            where: e?.where,
          },
        };
      }
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
        meta: { usedFilters: normalizedForWhere },
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
    let result;
    try {
      result = await pool.query(sql, newParams);
    } catch (e) {
      return {
        ok: false,
        message: 'Erro ao executar SQL (compare).',
        sqlError: {
          message: e?.message,
          code: e?.code,
          detail: e?.detail,
          hint: e?.hint,
          where: e?.where,
        },
      };
    }
    const rows = (result.rows || []).map((r) => ({
      label: r.label,
      base_value: Number(r.base_value) || 0,
      compare_value: Number(r.compare_value) || 0,
      delta: Number(r.delta) || 0,
      pct_change: r.pct_change === null ? null : Number(r.pct_change),
    }));
    return { ok: true, kind: 'compare', compare: { baseYear, compareYear, direction }, groupBy: spec.groupBy, rows, meta: { usedFilters: normalizedForWhere } };
  }

  return { ok: false, message: 'Consulta não suportada.' };
}

// =========================
// Self-healing: tenta reparar spec quando o banco devolver erro de SQL
// =========================

async function runQueryWithSelfHealing({
  spec,
  question,
  contextFilters,
  historyString,
  domainOptionsString,
  identity,
  dashboardContext,
  user,
  maxRetries = 2,
}) {
  let currentSpec = { ...(spec || {}) };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await runQuery(currentSpec, contextFilters, user);
    if (result?.ok) {
      return { ok: true, result, finalSpec: currentSpec, healed: attempt > 0 };
    }

    const canRepair = !!(result?.sqlError && attempt < maxRetries);
    if (!canRepair) {
      return { ok: false, result, finalSpec: currentSpec, healed: attempt > 0 };
    }

    const repaired = await deepseekRepairSpec({
      question,
      contextFilters,
      historyString,
      domainOptionsString,
      identity,
      dashboardContext,
      previousSpec: currentSpec,
      sqlError: result.sqlError,
    });

    if (!repaired) {
      return { ok: false, result, finalSpec: currentSpec, healed: attempt > 0 };
    }

    currentSpec = repaired;
  }

  return { ok: false, result: { ok: false, message: 'Falha ao reparar a consulta.' }, finalSpec: currentSpec, healed: true };
}

// =========================
// Insights: comparação automática com ano anterior (quando fizer sentido)
// =========================

async function buildPrevYearInsight({ spec, result, contextFilters, user }) {
  if (!spec || spec.type !== 'single' || !result || !result.ok) return null;
  const metric = spec.metric;
  if (!['total_matriculas', 'matriculas_ativas', 'desistentes', 'taxa_evasao', 'total_turmas', 'total_escolas'].includes(metric)) {
    return null;
  }

  const y = result?.meta?.effectiveYear;
  if (!Number.isFinite(Number(y))) return null;
  const year = Number(y);
  const prevYear = year - 1;
  if (prevYear < 1900) return null;

  const prevSpec = {
    ...spec,
    where: {
      ...(spec.where || {}),
      ano_letivo: prevYear,
    },
  };

  const prev = await runQuery(prevSpec, contextFilters, user);
  if (!prev?.ok || prev.kind !== 'single') return null;

  const cur = Number(result.value) || 0;
  const old = Number(prev.value) || 0;

  const delta = cur - old;
  const pct = old > 0 ? (delta * 100.0) / old : null;

  const formatValue = (v) => (metric === 'taxa_evasao' ? `${formatPtBRPercent(v)}%` : formatPtBRNumber(v));
  const deltaTxt = metric === 'taxa_evasao'
    ? `${formatPtBRPercent(Math.abs(delta))} p.p.`
    : formatPtBRNumber(Math.abs(delta));

  const up = delta > 0;
  const arrow = up ? '▲' : (delta < 0 ? '▼' : '▬');
  const trend = delta === 0 ? 'sem variação' : (up ? 'aumento' : 'redução');
  const pctTxt = pct === null ? '' : ` (${formatPtBRPercent(Math.abs(pct))}%)`;

  const text = `${arrow} Comparando com ${prevYear}: ${trend} de ${deltaTxt}${pctTxt}. (${formatValue(cur)} em ${year} vs ${formatValue(old)} em ${prevYear})`;

  return {
    year,
    prevYear,
    current: cur,
    previous: old,
    delta,
    pctChange: pct,
    text,
  };
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

function normalizeFiltersForCompare(o) {
  const obj = o || {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    // normaliza números/booleanos para string (evita mismatch 2026 vs "2026")
    out[k] = String(v);
  }
  return out;
}

function isSameActiveFilters(a, b) {
  const A = normalizeFiltersForCompare(a);
  const B = normalizeFiltersForCompare(b);
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const k of keys) {
    if ((A[k] ?? '') !== (B[k] ?? '')) return false;
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



  // DESISTÊNCIA / ABANDONO (prioridade)
  if (/desist|aband|evad|evas[aã]o/.test(q)) {
    const activeSit = ctx?.activeFilters?.situacaoMatricula ?? ctx?.activeFilters?.situacao_matricula;
    // Se o dashboard está filtrado em uma situação (ex.: ATIVO), o snapshot fica enviesado.
    // Para perguntas sobre desistência/abandono, prefira consultar o banco sem esse viés.
    if (activeSit && String(activeSit).trim() && !/desist|aband|evad|evas/i.test(String(activeSit).toLowerCase())) {
      return null;
    }

    // 1) se o snapshot já tem quebra por situação, use ela
    const porSit = totals.matriculasPorSituacao || totals.matriculas_por_situacao;
    if (porSit && typeof porSit === 'object') {
      const entries = Object.entries(porSit);
      const matched = entries.filter(([label]) => /desist|aband|evad|evas/.test(String(label).toLowerCase()));
      if (matched.length) {
        const total = matched.reduce((acc, [, v]) => acc + (Number(v) || 0), 0);
        const base = Number(totals.totalMatriculas ?? totals.total_matriculas) || 0;
        const pct = base > 0 ? (total * 100.0 / base) : null;
        const detalhe = matched
          .map(([label, v]) => `${label}: ${formatPtBRNumber(v)}`)
          .join(' | ');
        const extra = pct === null ? '' : ` (≈ ${formatPtBRPercent(pct)}%)`;
        return {
          ok: true,
          kind: 'ok',
          answer: `Desistência/abandono no filtro atual: ${formatPtBRNumber(total)}${extra}. ${detalhe}`,
          data: { value: total, percent: pct, matched, baseTotal: base },
          spec: { type: 'single', metric: 'desistentes' },
        };
      }
    }
    // 2) se não tem quebra, mas existe total de desistentes no snapshot
    const v = totals.desistentes ?? totals.totalDesistentes;
    if (v !== undefined && v !== null) {
      return { ok: true, kind: 'ok', answer: `Desistentes (filtro atual): ${formatPtBRNumber(v)}`, data: { value: Number(v) || 0 }, spec: { type: 'single', metric: 'desistentes' } };
    }
  }
  // IMPORTANTE: não "chutar" total quando o usuário pede lista/filtra (ex.: "quais turmas cheias").
  // Só responde com "total de turmas" se a pergunta for claramente de contagem.
  const vagasIntent = detectTurmasVagasIntent(question);
  if (
    /\bturmas?\b/.test(q) &&
    wantsCount(question) &&
    !wantsList(question) &&
    !vagasIntent &&
    !/por\s+escola|por\s+etapa|detalh|rank|top|lista/.test(q)
  ) {
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
    const activeSit = ctx?.activeFilters?.situacaoMatricula ?? ctx?.activeFilters?.situacao_matricula;
    // Se já existe filtro de situação aplicado, o snapshot mostra só aquela situação.
    // Para "por situação", o comportamento correto é ignorar esse filtro e agrupar tudo.
    if (activeSit && String(activeSit).trim()) return null;

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



  // Capacidade / vagas (totais)
  if (/\bvagas?\b/.test(q) && wantsCount(question) && !wantsList(question) && !/por\s+/.test(q) && !/rank|top|lista/.test(q)) {
    const v = totals.totalVagas ?? totals.total_vagas;
    if (v !== undefined && v !== null) {
      return { ok: true, answer: `Vagas disponíveis (total): ${formatPtBRNumber(v)}`, data: { value: Number(v) || 0 }, spec: { type: 'single', metric: 'total_vagas' } };
    }
  }

  if (/capacidade\s+total|total\s+de\s+capacidade/.test(q) && wantsCount(question) && !wantsList(question)) {
    const v = totals.capacidadeTotal ?? totals.capacidade_total;
    if (v !== undefined && v !== null) {
      return { ok: true, answer: `Capacidade total: ${formatPtBRNumber(v)}`, data: { value: Number(v) || 0 }, spec: { type: 'single', metric: 'capacidade_total' } };
    }
  }

  if (/taxa\s+de\s+ocupa[cç][aã]o|%\s*ocupa|ocupac[aã]o/.test(q) && !/por\s+/.test(q) && !/rank|top|lista/.test(q)) {
    const v = totals.taxaOcupacao ?? totals.taxa_ocupacao;
    if (v !== undefined && v !== null) {
      const n = Number(v);
      const fmt = Number.isFinite(n) ? `${n.toFixed(2).replace('.', ',')}%` : String(v);
      return { ok: true, answer: `Taxa de ocupação: ${fmt}`, data: { value: n }, spec: { type: 'single', metric: 'taxa_ocupacao' } };
    }
  }

  if (/por\s+zona/.test(q) && (/(vagas?|capacidade|ocupa[cç][aã]o)/.test(q)) && totals.capacidadePorZona) {
    const capZona = totals.capacidadePorZona || {};
    const rows = Object.keys(capZona).map((k) => ({
      label: k,
      value: /capacidade/.test(q) ? (Number(capZona[k]?.capacidade) || 0) : /vagas/.test(q) ? (Number(capZona[k]?.vagas) || 0) : (Number(capZona[k]?.matriculas_ativas) || 0),
    }));
    if (rows.length) {
      const metric = /capacidade/.test(q) ? 'capacidade_total' : /vagas/.test(q) ? 'total_vagas' : 'matriculas_ativas';
      return { ok: true, answer: /capacidade/.test(q) ? 'Capacidade por zona' : /vagas/.test(q) ? 'Vagas por zona' : 'Matrículas ativas por zona', data: { rows, groupBy: 'zona_escola', metric }, spec: { type: 'breakdown', metric, groupBy: 'zona_escola' } };
    }
  }
  

  // Capacidade/Vagas (totais do dashboard)
  if (/vagas?/.test(q) && wantsCount(question) && !wantsList(question) && !/por\s+/.test(q) && !/top|rank|lista/.test(q)) {
    const v = totals.totalVagas ?? totals.total_vagas;
    if (v !== undefined && v !== null) {
      return { ok: true, answer: `Total de vagas disponíveis: ${formatPtBRNumber(v)}`, data: { value: Number(v) || 0 }, spec: { type: 'single', metric: 'total_vagas' } };
    }
  }

  if (/capacidade/.test(q) && wantsCount(question) && !wantsList(question) && !/por\s+/.test(q) && !/top|rank|lista/.test(q)) {
    const v = totals.capacidadeTotal ?? totals.capacidade_total;
    if (v !== undefined && v !== null) {
      return { ok: true, answer: `Capacidade total (somatório das turmas): ${formatPtBRNumber(v)}`, data: { value: Number(v) || 0 }, spec: { type: 'single', metric: 'capacidade_total' } };
    }
  }

  if ((/taxa\s+de\s+ocupa|taxa\s+ocup|ocupac[aã]o/.test(q)) && !wantsList(question) && !/por\s+/.test(q) && !/top|rank|lista/.test(q)) {
    const v = totals.taxaOcupacao ?? totals.taxa_ocupacao;
    if (v !== undefined && v !== null) {
      const n = Number(v);
      return { ok: true, answer: `Taxa de ocupação (geral): ${Number(n).toFixed(2).replace('.', ',')}%`, data: { value: n }, spec: { type: 'single', metric: 'taxa_ocupacao' } };
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

    // 3.1) Turmas cheias / sem vagas (antes do snapshot)
    // Evita responder com "Total de turmas" quando o usuário quer filtrar por capacidade.
    const vagasIntent = detectTurmasVagasIntent(question);
    if (vagasIntent) {
      // Ambiguidade: "cheia" pode ser sem vagas OU excedida.
      if (vagasIntent.kind === 'ambiguous_cheia') {
        const resp = buildTurmasVagasDisambiguationResponse({ identity, question });
        await saveMessage(conversationId, 'assistant', resp.answer, resp.kind, resp.clarify);
        return res.json({ ...resp, conversationId });
      }

      const action = wantsCount(question) && !wantsList(question) ? 'count' : 'list';
      const limit = Math.min(Math.max(parseLimitFromQuestion(question) || 30, 1), 100);
      const yearsSingle = extractYears(question);
      const where = {};
      if (Array.isArray(yearsSingle) && yearsSingle.length === 1) where.ano_letivo = yearsSingle[0];
      const etapaFromText = inferEtapaAnoFromQuestion(question);
      if (etapaFromText) where.etapa_turma = etapaFromText;

      const spec = {
        type: 'turmas_vagas',
        action,
        vagasKind: vagasIntent.kind,
        threshold: vagasIntent.threshold,
        where,
        limit,
      };

      const result = await runTurmasVagasQuery(spec, contextFilters, req.user);
      if (!result.ok) {
        const resp = { ok: false, answer: result.message || 'Não consegui calcular vagas por turma.', conversationId };
        await saveMessage(conversationId, 'assistant', resp.answer, 'error', spec);
        return res.json(resp);
      }

      const namePrefix = identity.userName ? `${identity.userName}, ` : '';
      const label =
        vagasIntent.kind === 'sem_vagas' ? 'turmas sem vagas' :
        vagasIntent.kind === 'excedidas' ? 'turmas excedidas' :
        `turmas quase cheias (até ${Math.min(Math.max(Number(vagasIntent.threshold ?? 5) || 5, 1), 20)} vagas)`;

      if (result.kind === 'count') {
        const answer = `${namePrefix}${label}: ${formatPtBRNumber(result.total)}`;
        const payload = { ok: true, kind: 'single', answer, data: { value: result.total }, spec, conversationId };
        await saveMessage(conversationId, 'assistant', payload.answer, 'single', spec);
        return res.json(payload);
      }

      const rows = result.rows || [];
      const answer =
        `${namePrefix}encontrei **${formatPtBRNumber(rows.length)}** ${label}` +
        (action === 'list' && rows.length >= limit ? ` (mostrando até ${limit}).` : '.') +
        ` Quer que eu filtre por **escola**, **etapa** ou **turno**?`;

      const payload = {
        ok: true,
        kind: 'list',
        answer,
        data: { rows, vagasKind: vagasIntent.kind, threshold: vagasIntent.threshold ?? 5 },
        spec,
        conversationId,
      };
      await saveMessage(conversationId, 'assistant', payload.answer, 'list', spec);
      return res.json(payload);
    }



    // 3.2) Escolas cheias / sem vagas (antes do snapshot)
    const escolasVagasIntent = detectEscolasVagasIntent(question);
    if (escolasVagasIntent) {
      if (escolasVagasIntent.kind === 'ambiguous_cheia') {
        const resp = buildEscolasVagasDisambiguationResponse({ identity, question });
        await saveMessage(conversationId, 'assistant', resp.answer, resp.kind, resp.clarify);
        return res.json({ ...resp, conversationId });
      }

      const action = wantsCount(question) && !wantsList(question) ? 'count' : 'list';
      const limit = Math.min(Math.max(parseLimitFromQuestion(question) || 30, 1), 100);
      const yearsSingle = extractYears(question);
      const where = {};
      if (Array.isArray(yearsSingle) && yearsSingle.length === 1) where.ano_letivo = yearsSingle[0];

      const order = /mais\s+vagas|maior\s+vagas|top/.test(String(question||'').toLowerCase()) ? 'vagas_desc'
        : /menos\s+vagas|menor\s+vagas/.test(String(question||'').toLowerCase()) ? 'vagas_asc'
        : undefined;

      const spec = {
        type: 'escolas_vagas',
        action,
        vagasKind: escolasVagasIntent.kind,
        threshold: escolasVagasIntent.threshold,
        where,
        limit,
        order,
      };

      const result = await runEscolasVagasQuery(spec, contextFilters, req.user);
      if (!result.ok) {
        const resp = { ok: false, answer: result.message || 'Não consegui calcular vagas por escola.', conversationId };
        await saveMessage(conversationId, 'assistant', resp.answer, 'error', spec);
        return res.json(resp);
      }

      const namePrefix = identity.userName ? `${identity.userName}, ` : '';
      const label =
        escolasVagasIntent.kind === 'sem_vagas' ? 'escolas sem vagas' :
        escolasVagasIntent.kind === 'excedidas' ? 'escolas excedidas' :
        `escolas quase cheias (até ${Math.min(Math.max(Number(escolasVagasIntent.threshold ?? 5) || 5, 1), 20)} vagas)`;

      if (result.kind === 'count') {
        const answer = `${namePrefix}${label}: ${formatPtBRNumber(result.total)}`;
        const payload = { ok: true, kind: 'single', answer, data: { value: result.total }, spec, conversationId };
        await saveMessage(conversationId, 'assistant', payload.answer, 'single', spec);
        return res.json(payload);
      }

      const rows = result.rows || [];
      const answer =
        `${namePrefix}encontrei **${formatPtBRNumber(rows.length)}** ${label}` +
        (action === 'list' && rows.length >= limit ? ` (mostrando até ${limit}).` : '.') +
        ` Quer que eu filtre por **zona**, **etapa** ou **turno**?`;

      const payload = {
        ok: true,
        kind: 'list',
        answer,
        data: { rows, scope: 'escola', vagasKind: escolasVagasIntent.kind, threshold: escolasVagasIntent.threshold ?? 5 },
        spec,
        conversationId,
      };
      await saveMessage(conversationId, 'assistant', payload.answer, 'list', spec);
      return res.json(payload);
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
    const heur = heuristicSpec(question, contextFilters, dashboardContext);
    const domainOptionsString = formatDomainOptions(availableFilters);
    const spec = heur || (await deepseekToSpec(question, contextFilters, historyString, domainOptionsString, identity, dashboardContext));

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

    const exec = await runQueryWithSelfHealing({
      spec,
      question,
      contextFilters,
      historyString,
      domainOptionsString,
      identity,
      dashboardContext,
      user: req.user,
    });

    const result = exec.result;
    const finalSpec = exec.finalSpec || spec;

    if (!exec.ok || !result?.ok) {
      const resp = { ok: false, answer: result.message || 'Não consegui executar essa consulta.', conversationId };
      await saveMessage(conversationId, 'assistant', resp.answer, 'error', spec);
      return res.json(resp);
    }

    const metricLabel = ALLOWED_METRICS[finalSpec.metric].label;

    if (result.kind === 'single') {
      const valueFmt = finalSpec.metric === 'taxa_evasao' ? `${formatPtBRPercent(result.value)}%` : formatPtBRNumber(result.value);
      const answer = (identity.userName && created)
        ? `${identity.userName}, ${metricLabel}: ${valueFmt}`
        : `${metricLabel}: ${valueFmt}`;
      const insight = await buildPrevYearInsight({ spec: finalSpec, result, contextFilters, user: req.user });
      const answerWithInsight = insight ? `${answer}\n\n📌 ${insight.text}` : answer;
      const payload = {
        ok: true,
        kind: 'single',
        answer: answerWithInsight,
        data: { value: result.value, insights: insight ? { prevYear: insight.prevYear, delta: insight.delta, pctChange: insight.pctChange } : null },
        insights: insight || null,
        spec: finalSpec,
        healed: !!exec.healed,
        conversationId,
      };
      await saveMessage(conversationId, 'assistant', payload.answer, 'single', finalSpec);
      return res.json(payload);
    }

    if (result.kind === 'breakdown') {
      const rows = (result.rows || []).map((r) => ({ label: r.label, value: Number(r.value) || 0 }));
      const groupTxt = String(result.groupBy || finalSpec.groupBy || '').replace('_', ' ');
      let answer = `${metricLabel} por ${groupTxt}`;
      if (rows.length === 1 && finalSpec?.groupBy) {
        const v = rows[0].value;
        const vFmt = finalSpec.metric === 'taxa_evasao' ? `${formatPtBRPercent(v)}%` : formatPtBRNumber(v);
        const isAsc = String(finalSpec.order || 'desc') === 'asc';
        const lead = isAsc ? 'Menor' : 'Maior';
        answer = `${lead} ${metricLabel.toLowerCase()} em ${groupTxt}: ${rows[0].label} (${vFmt})`;
      }
      if (identity.userName && created) answer = `${identity.userName}, ${answer}`;

      const payload = { ok: true, kind: 'breakdown', answer, data: { rows, groupBy: result.groupBy, metric: finalSpec.metric }, spec: finalSpec, healed: !!exec.healed, conversationId };
      await saveMessage(conversationId, 'assistant', payload.answer, 'breakdown', finalSpec);
      return res.json(payload);
    }

    if (result.kind === 'compare') {
      const baseYear = result.compare?.baseYear;
      const compareYear = result.compare?.compareYear;
      const groupLabel = finalSpec.groupBy ? ` por ${finalSpec.groupBy.replace('_', ' ')}` : '';
      const dir = String(result.compare?.direction || 'all');
      const dirTxt = dir === 'decrease' ? 'redução' : dir === 'increase' ? 'aumento' : 'variação';
      let answer = `${metricLabel}${groupLabel} — comparativo ${compareYear} vs ${baseYear} (${dirTxt})`;
      if (identity.userName && created) answer = `${identity.userName}, ${answer}`;
      const payload = {
        ok: true,
        kind: 'compare',
        answer,
        data: { rows: result.rows, groupBy: finalSpec.groupBy || null, metric: finalSpec.metric, compare: result.compare },
        spec: finalSpec,
        healed: !!exec.healed,
        conversationId,
      };
      await saveMessage(conversationId, 'assistant', payload.answer, 'compare', finalSpec);
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
