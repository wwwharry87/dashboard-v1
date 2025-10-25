// dashboardController_fixed.js
'use strict';

const pool = require('../config/db');
const NodeCache = require('node-cache');

// Cache 5 min
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const clientField = 'idcliente';

/* ============================================================
 * Helpers
 * ============================================================ */

/**
 * Gera chave de cache estável por usuário + filtros.
 */
function generateCacheKey(prefix, filters = {}, user = {}) {
  const uid = user?.id || user?.email || 'anon';
  return `${prefix}:${uid}:${JSON.stringify(filters)}`;
}

/**
 * Monta cláusula WHERE e params de forma segura.
 * Aceita filtros:
 *   - idcliente (obrigatório para multi-tenant)
 *   - anoLetivo, deficiencia, grupoEtapa, etapaMatricula, etapaTurma, multisserie,
 *     situacaoMatricula, tipoMatricula, tipoTransporte, transporteEscolar, idescola
 */
function buildWhereClause(filters = {}, user = {}) {
  const whereClauses = [];
  const params = [];

  // Multi-tenant: força idcliente
  if (filters.idcliente) {
    params.push(filters.idcliente);
    whereClauses.push(`${clientField} = $${params.length}::integer`);
  } else if (user?.idcliente) {
    params.push(user.idcliente);
    whereClauses.push(`${clientField} = $${params.length}::integer`);
  } else {
    // Sem cliente definido, bloqueia
    whereClauses.push('1=0');
  }

  const addFilter = (val, col) => {
    if (val === undefined || val === null || val === '') return;
    params.push(val);
    whereClauses.push(`${col} = $${params.length}`);
  };

  const addTextFilterUpper = (val, col) => {
    if (val === undefined || val === null || val === '') return;
    params.push(String(val).toUpperCase());
    whereClauses.push(`UPPER(${col}) = $${params.length}`);
  };

  // Básicos
  if (filters.anoLetivo) {
    params.push(filters.anoLetivo);
    whereClauses.push(`ano_letivo = $${params.length}::integer`);
  }

  addTextFilterUpper(filters.deficiencia, "deficiencia");
  addTextFilterUpper(filters.grupoEtapa, "grupo_etapa");
  addTextFilterUpper(filters.etapaMatricula, "etapa_matricula");
  addTextFilterUpper(filters.etapaTurma, "etapa_turma");
  addTextFilterUpper(filters.multisserie, "multisserie");
  addTextFilterUpper(filters.situacaoMatricula, "situacao_matricula");
  addTextFilterUpper(filters.tipoMatricula, "tipo_matricula");
  addTextFilterUpper(filters.tipoTransporte, "tipo_transporte");
  addTextFilterUpper(filters.transporteEscolar, "transporte_escolar");

  if (filters.idescola !== undefined && filters.idescola !== null && filters.idescola !== '') {
    params.push(filters.idescola);
    whereClauses.push(`idescola = $${params.length}::integer`);
  }

  // Fallback
  if (!whereClauses.length) whereClauses.push('1=1');

  return { clause: whereClauses.join(' AND '), params };
}

/** Enforce: totals = soma por zona; recalcula taxaOcupacao */
function enforceConsistencyTotals(r) {
  if (!r || typeof r !== 'object') return r;
  const zonas = r.capacidadePorZona || {};
  const sumZona = (obj, field) =>
    Object.values(obj || {}).reduce((acc, z) => acc + (Number(z?.[field]) || 0), 0);

  const sane = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

  const capZona    = sumZona(zonas, 'capacidade');
  const vagasZona  = sumZona(zonas, 'vagas');
  const ativasZona = sumZona(zonas, 'matriculas_ativas');

  if (capZona > 0) r.capacidadeTotal = capZona;
  if (vagasZona >= 0) r.totalVagas = vagasZona;
  if (ativasZona > 0) r.totalMatriculasAtivas = ativasZona;

  r.capacidadeTotal       = sane(r.capacidadeTotal);
  r.totalVagas            = sane(r.totalVagas);
  r.totalMatriculasAtivas = sane(r.totalMatriculasAtivas);

  r.taxaOcupacao = r.capacidadeTotal > 0
    ? Number(((r.totalMatriculasAtivas * 100) / r.capacidadeTotal).toFixed(2))
    : 0;

  // Sane extras
  r.totalMatriculas = sane(r.totalMatriculas);
  r.totalEscolas    = sane(r.totalEscolas);
  r.totalTurmas     = sane(r.totalTurmas);
  r.taxaEvasao      = sane(r.taxaEvasao);

  return r;
}

/* ============================================================
 * Controllers
 * ============================================================ */

// POST /totais
const buscarTotais = async (req, res) => {
  try {
    const filters = {
      anoLetivo: req.body.anoLetivo,
      deficiencia: req.body.deficiencia,
      grupoEtapa: req.body.grupoEtapa,
      etapaMatricula: req.body.etapaMatricula,
      etapaTurma: req.body.etapaTurma,
      multisserie: req.body.multisserie,
      situacaoMatricula: req.body.situacaoMatricula,
      tipoMatricula: req.body.tipoMatricula,
      tipoTransporte: req.body.tipoTransporte,
      transporteEscolar: req.body.transporteEscolar,
      idcliente: req.body.idcliente,
      idescola: req.body.idescola
    };

    const cacheKey = generateCacheKey('totais', filters, req.user);
    const cachedData = cache.get(cacheKey);
    if (cachedData) return res.json(cachedData);

    const { clause, params } = buildWhereClause(filters, req.user);

    // CTEs: calculam capacidade por escola (MAX para evitar inflação),
    // por zona, ativas, vagas e demais agregações para o frontend.
    const query = `
      WITH base_filtrada AS (
        SELECT * FROM dados_matriculas WHERE ${clause}
      ),
      -- Remove registros com "situacoes especiais" se desejar (ex: CANCELADA da base de capacidade)
      base_sem_especiais AS (
        SELECT * FROM base_filtrada
        WHERE COALESCE(UPPER(situacao_matricula),'') NOT IN ('FALECIDO')
      ),
      cap_por_escola AS (
        SELECT
          COALESCE(CAST(idescola AS TEXT), escola) AS escola_key,
          MAX(COALESCE(capacidade,0)) AS capacidade,
          MAX(zona_escola) AS zona,
          MAX(escola) AS escola_nome
        FROM base_sem_especiais
        GROUP BY COALESCE(CAST(idescola AS TEXT), escola)
      ),
      capacidade_por_zona AS (
        SELECT
          CASE WHEN UPPER(zona) LIKE '%RUR%' THEN 'RURAL' ELSE 'URBANA' END AS zona,
          SUM(capacidade) AS capacidade
        FROM cap_por_escola
        GROUP BY 1
      ),
      matriculas_ativas_por_zona AS (
        SELECT
          CASE WHEN UPPER(zona_escola) LIKE '%RUR%' THEN 'RURAL' ELSE 'URBANA' END AS zona,
          COUNT(*) AS matriculas_ativas
        FROM base_filtrada
        WHERE UPPER(situacao_matricula) IN ('ATIVO','ATIVA','MATRICULADO')
        GROUP BY 1
      ),
      vagas_por_zona AS (
        SELECT
          cz.zona,
          cz.capacidade,
          COALESCE(maz.matriculas_ativas,0) AS matriculas_ativas,
          GREATEST(cz.capacidade - COALESCE(maz.matriculas_ativas,0), 0) AS vagas
        FROM capacidade_por_zona cz
        LEFT JOIN matriculas_ativas_por_zona maz ON maz.zona = cz.zona
      ),
      metricas_base AS (
        SELECT
          COUNT(*) AS total_matriculas,
          COUNT(DISTINCT idescola) AS total_escolas,
          COUNT(DISTINCT idturma) AS total_turmas,
          COUNT(*) FILTER (WHERE UPPER(situacao_matricula) IN ('ATIVO','ATIVA','MATRICULADO')) AS total_ativas,
          COUNT(*) FILTER (WHERE UPPER(situacao_matricula) = 'DESISTENTE') AS total_desistentes,
          COUNT(*) FILTER (WHERE COALESCE(UPPER(deficiencia),'') IN ('1','TRUE','SIM','SIM/NEE','SIM/DEF')) AS alunos_deficiencia,
          COUNT(*) FILTER (WHERE COALESCE(UPPER(transporte_escolar),'') IN ('1','TRUE','SIM')) AS alunos_transporte,
          COUNT(*) FILTER (WHERE data_entrada IS NOT NULL) AS total_entradas,
          COUNT(*) FILTER (WHERE data_saida   IS NOT NULL) AS total_saidas
        FROM base_filtrada
      ),
      por_zona_matriculas AS (
        SELECT
          CASE WHEN UPPER(zona_escola) LIKE '%RUR%' THEN 'RURAL' ELSE 'URBANA' END AS zona,
          COUNT(*) AS total
        FROM base_filtrada
        WHERE UPPER(situacao_matricula) IN ('ATIVO','ATIVA','MATRICULADO')
        GROUP BY 1
      ),
      por_zona_escolas AS (
        SELECT
          CASE WHEN UPPER(zona) LIKE '%RUR%' THEN 'RURAL' ELSE 'URBANA' END AS zona,
          COUNT(*) AS total
        FROM cap_por_escola
        GROUP BY 1
      ),
      por_zona_turmas AS (
        SELECT
          CASE WHEN UPPER(zona_escola) LIKE '%RUR%' THEN 'RURAL' ELSE 'URBANA' END AS zona,
          COUNT(DISTINCT idturma) AS total
        FROM base_filtrada
        GROUP BY 1
      ),
      por_turno AS (
        SELECT UPPER(turno) AS turno, COUNT(*) AS total
        FROM base_filtrada
        GROUP BY 1
      ),
      por_sexo AS (
        SELECT UPPER(sexo) AS sexo, COUNT(*) AS total
        FROM base_filtrada
        GROUP BY 1
      ),
      por_situacao AS (
        SELECT UPPER(situacao_matricula) AS situacao, COUNT(*) AS total
        FROM base_filtrada
        GROUP BY 1
      ),
      entradas_mes AS (
        SELECT TO_CHAR(CAST(data_entrada AS DATE), 'MM') AS mes, COUNT(*) AS entradas
        FROM base_filtrada WHERE data_entrada IS NOT NULL GROUP BY 1
      ),
      saidas_mes AS (
        SELECT TO_CHAR(CAST(data_saida   AS DATE), 'MM') AS mes, COUNT(*) AS saidas
        FROM base_filtrada WHERE data_saida   IS NOT NULL GROUP BY 1
      ),
      entradas_saidas AS (
        SELECT COALESCE(e.mes, s.mes) AS mes, COALESCE(e.entradas,0) AS entradas, COALESCE(s.saidas,0) AS saidas
        FROM entradas_mes e FULL OUTER JOIN saidas_mes s ON s.mes = e.mes
      ),
      escolas_list AS (
        SELECT
          idescola,
          MAX(escola) AS escola,
          CASE WHEN MAX(UPPER(zona_escola)) LIKE '%RUR%' THEN 'RURAL' ELSE 'URBANA' END AS zona,
          MAX(COALESCE(capacidade,0)) AS capacidade,
          COUNT(*) FILTER (WHERE UPPER(situacao_matricula) IN ('ATIVO','ATIVA','MATRICULADO')) AS total_matriculas,
          GREATEST(MAX(COALESCE(capacidade,0)) - COUNT(*) FILTER (WHERE UPPER(situacao_matricula) IN ('ATIVO','ATIVA','MATRICULADO')), 0) AS vagas
        FROM base_filtrada
        GROUP BY idescola
      )
      SELECT
        (SELECT jsonb_build_object(
          'totalMatriculas', total_matriculas,
          'totalEscolas', total_escolas,
          'totalTurmas', total_turmas,
          'totalMatriculasAtivas', total_ativas,
          'desistentes', total_desistentes,
          'alunosComDeficiencia', alunos_deficiencia,
          'alunosTransporteEscolar', alunos_transporte,
          'totalEntradas', total_entradas,
          'totalSaidas', total_saidas
        ) FROM metricas_base) AS metricas,
        (SELECT jsonb_object_agg(zona, jsonb_build_object('capacidade', capacidade, 'matriculas_ativas', matriculas_ativas, 'vagas', vagas)) FROM vagas_por_zona) AS capacidade_por_zona,
        (SELECT jsonb_object_agg(zona, total) FROM por_zona_matriculas) AS matriculas_por_zona,
        (SELECT jsonb_object_agg(zona, total) FROM por_zona_escolas) AS escolas_por_zona,
        (SELECT jsonb_object_agg(zona, total) FROM por_zona_turmas) AS turmas_por_zona,
        (SELECT jsonb_object_agg(UPPER(turno), total) FROM por_turno) AS por_turno,
        (SELECT jsonb_object_agg(UPPER(sexo), total) FROM por_sexo) AS por_sexo,
        (SELECT jsonb_object_agg(UPPER(situacao), total) FROM por_situacao) AS por_situacao,
        (SELECT jsonb_object_agg(mes, jsonb_build_object('entradas', entradas, 'saidas', saidas)) FROM entradas_saidas) AS entradas_saidas,
        (SELECT jsonb_agg(e.*) FROM escolas_list e) AS escolas
      ;
    `;

    const { rows } = await pool.query(query, params);
    const row = rows[0] || {};

    const m = row.metricas || {};
    const capacidadePorZona = row.capacidade_por_zona || {};

    const responseData = {
      totalMatriculas: Number(m.totalMatriculas) || 0,
      totalEscolas: Number(m.totalEscolas) || 0,
      totalTurmas: Number(m.totalTurmas) || 0,
      totalMatriculasAtivas: Number(m.totalMatriculasAtivas) || 0,
      alunosComDeficiencia: Number(m.alunosComDeficiencia) || 0,
      alunosTransporteEscolar: Number(m.alunosTransporteEscolar) || 0,
      totalEntradas: Number(m.totalEntradas) || 0,
      totalSaidas: Number(m.totalSaidas) || 0,

      capacidadePorZona: capacidadePorZona || {},

      matriculasPorZona: row.matriculas_por_zona || {},
      escolasPorZona: row.escolas_por_zona || {},
      turmasPorZona: row.turmas_por_zona || {},

      matriculasPorTurno: row.por_turno || {},
      matriculasPorSexo: row.por_sexo || {},
      matriculasPorSituacao: row.por_situacao || {},

      entradasSaidasPorMes: row.entradas_saidas || {},

      // Derivados (ajustados abaixo)
      capacidadeTotal: 0,
      totalVagas: 0,
      taxaOcupacao: 0,
      taxaEvasao: (() => {
        const total = Number(m.totalMatriculas) || 0;
        const des  = Number(m.desistentes) || 0;
        return total > 0 ? Number(((des / total) * 100).toFixed(2)) : 0;
      })(),
      ultimaAtualizacao: new Date().toISOString(),
    };

    enforceConsistencyTotals(responseData);

    cache.set(cacheKey, responseData);
    res.json(responseData);
  } catch (error) {
    console.error("Erro em buscarTotais:", error);
    res.status(500).json({ error: "Erro ao buscar totais", details: error.message });
  }
};

// GET /filtros
const buscarFiltros = async (req, res) => {
  try {
    const filters = {
      idcliente: req.query.idcliente || req.body.idcliente || req.user?.idcliente || null
    };
    const { clause, params } = buildWhereClause(filters, req.user);

    const sql = `
      WITH base AS (
        SELECT * FROM dados_matriculas WHERE ${clause}
      )
      SELECT
        array_agg(DISTINCT ano_letivo ORDER BY ano_letivo DESC) AS ano_letivo,
        array_agg(DISTINCT UPPER(tipo_matricula))             AS tipo_matricula,
        array_agg(DISTINCT UPPER(situacao_matricula))         AS situacao_matricula,
        array_agg(DISTINCT UPPER(grupo_etapa))                AS grupo_etapa,
        array_agg(DISTINCT UPPER(etapa_matricula))            AS etapa_matricula,
        array_agg(DISTINCT UPPER(etapa_turma))                AS etapa_turma,
        array_agg(DISTINCT UPPER(multisserie))                AS multisserie,
        array_agg(DISTINCT UPPER(deficiencia))                AS deficiencia,
        array_agg(DISTINCT UPPER(transporte_escolar))         AS transporte_escolar,
        array_agg(DISTINCT UPPER(tipo_transporte))            AS tipo_transporte
      FROM base;
    `;

    const { rows } = await pool.query(sql, params);
    const r = rows[0] || {};
    res.json({
      ano_letivo: r.ano_letivo || [],
      tipo_matricula: r.tipo_matricula || [],
      situacao_matricula: r.situacao_matricula || [],
      grupo_etapa: r.grupo_etapa || [],
      etapa_matricula: r.etapa_matricula || [],
      etapa_turma: r.etapa_turma || [],
      multisserie: r.multisserie || [],
      deficiencia: r.deficiencia || [],
      transporte_escolar: r.transporte_escolar || [],
      tipo_transporte: r.tipo_transporte || [],
    });
  } catch (error) {
    console.error("Erro em buscarFiltros:", error);
    res.status(500).json({ error: "Erro ao buscar filtros", details: error.message });
  }
};

// (Opcional) POST /breakdowns – exemplo de outra agregação
const buscarBreakdowns = async (req, res) => {
  try {
    const filters = req.body || {};
    const { clause, params } = buildWhereClause(filters, req.user);

    const sql = `
      WITH base AS (
        SELECT * FROM dados_matriculas WHERE ${clause}
      )
      SELECT
        (SELECT jsonb_object_agg(UPPER(turno), COUNT(*)) FROM base GROUP BY UPPER(turno)) AS por_turno,
        (SELECT jsonb_object_agg(UPPER(sexo), COUNT(*))  FROM base GROUP BY UPPER(sexo))  AS por_sexo
    `;
    const { rows } = await pool.query(sql, params);
    res.json(rows[0] || {});
  } catch (error) {
    console.error("Erro em buscarBreakdowns:", error);
    res.status(500).json({ error: "Erro ao buscar breakdowns", details: error.message });
  }
};

// POST /cache/clear
const limparCache = async (req, res) => {
  try {
    const resultado = cache.flushAll();
    res.json({ success: resultado, message: "Cache limpo com sucesso", timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("Erro ao limpar cache:", err);
    res.status(500).json({ error: "Erro ao limpar cache", details: err.message });
  }
};

module.exports = {
  buscarTotais,
  buscarFiltros,
  buscarBreakdowns,
  limparCache,
  buildWhereClause,
  generateCacheKey
};
