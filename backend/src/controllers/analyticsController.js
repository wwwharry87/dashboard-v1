'use strict';

const pool = require('../config/db');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Reutiliza utilitários do dashboard (mantenha estes exports no seu dashboardController.js)
let buildWhereClause, generateCacheKey;
try {
  ({ buildWhereClause, generateCacheKey } = require('./dashboardController'));
} catch (e) {
  // Fallback simples caso não exista ou esteja em outro caminho
  buildWhereClause = () => '1=1';
  generateCacheKey = (prefix, filters) => `${prefix}:${JSON.stringify(filters)}`;
}

/** Normaliza e força consistência entre totais e por zona */
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

  r.totalMatriculas = sane(r.totalMatriculas);
  r.totalEscolas    = sane(r.totalEscolas);
  r.totalTurmas     = sane(r.totalTurmas);
  r.taxaEvasao      = sane(r.taxaEvasao);

  return r;
}

const buscarAnalytics = async (req, res) => {
  try {
    const filters = req.body || {};
    const clause = buildWhereClause(filters);
    const cacheKey = generateCacheKey('analytics', filters);

    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    // Ajuste aqui o nome da sua tabela única
    const sql = `
      WITH base AS (
        SELECT *
        FROM dados_matriculas
        WHERE ${clause}
      ),
      -- Capacidade por escola (usa o maior valor visto para não somar capacidade n vezes)
      cap_por_escola AS (
        SELECT
          COALESCE(CAST(idescola AS TEXT), escola) AS escola_key,
          MAX(COALESCE(capacidade,0)) AS capacidade,
          MAX(zona_escola) AS zona,
          MAX(escola) AS escola_nome
        FROM base
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
        FROM base
        WHERE UPPER(situacao) IN ('ATIVO','ATIVA','MATRICULADO')
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
          COUNT(*) FILTER (WHERE UPPER(situacao) IN ('ATIVO','ATIVA','MATRICULADO')) AS total_ativas,
          COUNT(*) FILTER (WHERE UPPER(situacao) = 'DESISTENTE') AS total_desistentes,
          COUNT(*) FILTER (WHERE COALESCE(CAST(deficiencia AS TEXT),'') IN ('1','TRUE','SIM')) AS alunos_deficiencia,
          COUNT(*) FILTER (WHERE COALESCE(CAST(transporte AS TEXT),'') IN ('1','TRUE','SIM')) AS alunos_transporte
        FROM base
      ),
      por_sexo AS (
        SELECT UPPER(sexo) AS sexo, COUNT(*) AS total FROM base GROUP BY 1
      ),
      por_turno AS (
        SELECT UPPER(turno) AS turno, COUNT(*) AS total FROM base GROUP BY 1
      ),
      por_situacao AS (
        SELECT UPPER(situacao) AS situacao, COUNT(*) AS total FROM base GROUP BY 1
      ),
      por_zona AS (
        SELECT CASE WHEN UPPER(zona_escola) LIKE '%RUR%' THEN 'RURAL' ELSE 'URBANA' END AS zona, COUNT(*) AS total
        FROM base GROUP BY 1
      ),
      entradas_mes AS (
        SELECT TO_CHAR(CAST(data_entrada AS DATE), 'MM') AS mes, COUNT(*) AS entradas
        FROM base WHERE data_entrada IS NOT NULL GROUP BY 1
      ),
      saidas_mes AS (
        SELECT TO_CHAR(CAST(data_saida AS DATE), 'MM') AS mes, COUNT(*) AS saidas
        FROM base WHERE data_saida IS NOT NULL GROUP BY 1
      ),
      entradas_saidas AS (
        SELECT COALESCE(e.mes, s.mes) AS mes, COALESCE(e.entradas,0) AS entradas, COALESCE(s.saidas,0) AS saidas
        FROM entradas_mes e FULL OUTER JOIN saidas_mes s ON s.mes = e.mes
      )
      SELECT
        (SELECT jsonb_build_object(
          'total_matriculas', total_matriculas,
          'total_escolas', total_escolas,
          'total_turmas', total_turmas,
          'totalMatriculasAtivas', total_ativas,
          'desistentes', total_desistentes,
          'alunosComDeficiencia', alunos_deficiencia,
          'alunosTransporteEscolar', alunos_transporte
        ) FROM metricas_base) AS metricas,
        (SELECT jsonb_object_agg(zona, jsonb_build_object(
            'capacidade', capacidade,
            'matriculas_ativas', matriculas_ativas,
            'vagas', vagas
        )) FROM vagas_por_zona) AS capacidade_por_zona,
        (SELECT jsonb_object_agg(UPPER(sexo), total) FROM por_sexo) AS por_sexo,
        (SELECT jsonb_object_agg(UPPER(turno), total) FROM por_turno) AS por_turno,
        (SELECT jsonb_object_agg(UPPER(situacao), total) FROM por_situacao) AS por_situacao,
        (SELECT jsonb_object_agg(zona, total) FROM por_zona) AS por_zona,
        (SELECT jsonb_object_agg(mes, jsonb_build_object('entradas', entradas, 'saidas', saidas)) FROM entradas_saidas) AS entradas_saidas;
    `;

    const { rows } = await pool.query(sql);
    const row = rows[0] || {};

    const metricas = row.metricas || {};
    const capacidadePorZona = row.capacidade_por_zona || {};

    const responseData = {
      totalMatriculas: Number(metricas.total_matriculas) || 0,
      totalEscolas: Number(metricas.total_escolas) || 0,
      totalTurmas: Number(metricas.total_turmas) || 0,
      totalMatriculasAtivas: Number(metricas.totalMatriculasAtivas) || 0,
      alunosComDeficiencia: Number(metricas.alunosComDeficiencia) || 0,
      alunosTransporteEscolar: Number(metricas.alunosTransporteEscolar) || 0,

      capacidadePorZona: capacidadePorZona || {},

      matriculasPorSexo: row.por_sexo || {},
      matriculasPorTurno: row.por_turno || {},
      matriculasPorSituacao: row.por_situacao || {},
      matriculasPorZona: row.por_zona || {},

      entradasSaidasPorMes: row.entradas_saidas || {},

      capacidadeTotal: 0,
      totalVagas: 0,
      taxaOcupacao: 0,
      taxaEvasao: (() => {
        const total = Number(metricas.total_matriculas) || 0;
        const des  = Number(metricas.desistentes) || 0;
        return total > 0 ? Number(((des / total) * 100).toFixed(2)) : 0;
      })(),
      ultimaAtualizacao: new Date().toISOString(),
    };

    enforceConsistencyTotals(responseData);
    cache.set(cacheKey, responseData);
    return res.json(responseData);
  } catch (err) {
    console.error('[analyticsController] buscarAnalytics error:', err);
    return res.status(500).json({ error: 'Erro ao buscar analytics', details: err?.message });
  }
};

module.exports = {
  buscarAnalytics,
};
