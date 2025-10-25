// analyticsController.js (consistente com dashboardController corrigido)
'use strict';

const pool = require('../config/db');
const NodeCache = require('node-cache');

// Cache (5 min)
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Reutiliza utilitários do dashboard (filtros e chave de cache)
const { buildWhereClause, generateCacheKey } = require('./dashboardController');

/**
 * Garante consistência entre totais e zonas
 */
function enforceConsistencyTotals(r) {
  if (!r || typeof r !== 'object') return r;

  const zonas = r.capacidadePorZona || {};
  const sumZona = (obj, field) =>
    Object.values(obj || {}).reduce((acc, z) => acc + (Number(z?.[field]) || 0), 0);

  const sane = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

  const capZona = sumZona(zonas, 'capacidade');
  const vagasZona = sumZona(zonas, 'vagas');
  const ativasZona = sumZona(zonas, 'matriculas_ativas');

  if (capZona > 0) r.capacidadeTotal = capZona;
  if (vagasZona >= 0) r.totalVagas = vagasZona;
  if (ativasZona > 0) r.totalMatriculasAtivas = ativasZona;

  r.capacidadeTotal = sane(r.capacidadeTotal);
  r.totalVagas = sane(r.totalVagas);
  r.totalMatriculasAtivas = sane(r.totalMatriculasAtivas);

  r.taxaOcupacao = r.capacidadeTotal > 0
    ? Number(((r.totalMatriculasAtivas * 100) / r.capacidadeTotal).toFixed(2))
    : 0;

  // Saneia outros agregados
  r.totalMatriculas = sane(r.totalMatriculas);
  r.totalEscolas = sane(r.totalEscolas);
  r.totalTurmas = sane(r.totalTurmas);
  r.taxaEvasao = sane(r.taxaEvasao);

  return r;
}

/**
 * Controller principal de analytics
 */
const buscarAnalytics = async (req, res) => {
  try {
    const filters = req.body || {};
    const { clause, params } = buildWhereClause(filters, req.user);
    const cacheKey = generateCacheKey('analytics', filters, req.user);

    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    // QUERY SIMPLIFICADA usando a mesma lógica do dashboardController corrigido
    const sql = `
      WITH base AS (
        SELECT * FROM dados_matriculas WHERE ${clause}
      ),

      base_sem_especiais AS (
        SELECT * FROM base WHERE COALESCE(idetapa_matricula,0) NOT IN (98,99)
      ),

      /* Mesma lógica do dashboardController para capacidade */
      turmas AS (
        SELECT DISTINCT escola, idescola, idturma, limite_maximo_aluno
        FROM base_sem_especiais
        WHERE idturma IS NOT NULL AND idturma != 0
      ),

      total_matriculas_por_escola AS (
        SELECT 
          idescola, 
          COUNT(*) AS qtde_matriculas
        FROM base_sem_especiais
        WHERE UPPER(COALESCE(situacao_matricula,'')) IN ('ATIVO','ATIVA')
           OR COALESCE(idsituacao,0) = 0
        GROUP BY idescola
      ),

      escolas_detalhes AS (
        SELECT 
          t.escola,
          t.idescola,
          t.zona_escola,
          COUNT(t.idturma) AS qtde_turmas,
          COALESCE(tm.qtde_matriculas, 0) AS qtde_matriculas,
          SUM(COALESCE(t.limite_maximo_aluno, 0)) AS capacidade_total,
          GREATEST(SUM(COALESCE(t.limite_maximo_aluno, 0)) - COALESCE(tm.qtde_matriculas, 0), 0) AS vagas_disponiveis
        FROM base_sem_especiais t
        LEFT JOIN total_matriculas_por_escola tm ON t.idescola = tm.idescola
        WHERE t.idescola IS NOT NULL
        GROUP BY t.escola, t.idescola, t.zona_escola, tm.qtde_matriculas
      ),

      capacidade_agg AS (
        SELECT
          COALESCE(SUM(capacidade_total), 0) AS capacidade_total,
          COALESCE(SUM(qtde_matriculas), 0) AS total_matriculas_ativas,
          COALESCE(SUM(vagas_disponiveis), 0) AS total_vagas
        FROM escolas_detalhes
      ),

      capacidade_por_zona AS (
        SELECT
          COALESCE(zona_escola, 'Sem informação') AS zona,
          COALESCE(SUM(capacidade_total), 0) AS capacidade,
          COALESCE(SUM(qtde_matriculas), 0) AS matriculas_ativas,
          COALESCE(SUM(vagas_disponiveis), 0) AS vagas
        FROM escolas_detalhes
        GROUP BY COALESCE(zona_escola, 'Sem informação')
      ),

      metricas_base AS (
        SELECT
          COUNT(DISTINCT idmatricula) AS total_matriculas,
          COUNT(DISTINCT idescola) AS total_escolas,
          COUNT(DISTINCT idturma) AS total_turmas,
          (SELECT total_matriculas_ativas FROM capacidade_agg) AS total_ativas,
          COUNT(DISTINCT idmatricula) FILTER (WHERE COALESCE(idsituacao,0) = 2) AS total_desistentes,
          COUNT(DISTINCT idmatricula) FILTER (WHERE COALESCE(CAST(deficiencia AS TEXT),'') IN ('1','TRUE','SIM')) AS alunos_deficiencia,
          COUNT(DISTINCT idmatricula) FILTER (WHERE COALESCE(CAST(transporte_escolar AS TEXT),'') IN ('1','TRUE','SIM')) AS alunos_transporte
        FROM base_sem_especiais
      ),

      /* Quebras */
      por_sexo AS (
        SELECT COALESCE(UPPER(sexo), 'SEM INFORMAÇÃO') AS sexo, COUNT(DISTINCT idmatricula) AS total
        FROM base_sem_especiais
        GROUP BY COALESCE(UPPER(sexo), 'SEM INFORMAÇÃO')
      ),
      por_turno AS (
        SELECT COALESCE(UPPER(turno), 'SEM INFORMAÇÃO') AS turno, COUNT(DISTINCT idmatricula) AS total
        FROM base_sem_especiais
        GROUP BY COALESCE(UPPER(turno), 'SEM INFORMAÇÃO')
      ),
      por_situacao AS (
        SELECT COALESCE(UPPER(situacao_matricula), 'SEM INFORMAÇÃO') AS situacao, COUNT(DISTINCT idmatricula) AS total
        FROM base_sem_especiais
        GROUP BY COALESCE(UPPER(situacao_matricula), 'SEM INFORMAÇÃO')
      ),
      por_zona_aluno AS (
        SELECT COALESCE(zona_aluno, 'Sem informação') AS zona, COUNT(DISTINCT idmatricula) AS total
        FROM base_sem_especiais
        GROUP BY COALESCE(zona_aluno, 'Sem informação')
      )

      SELECT
        /* Métricas globais */
        (SELECT jsonb_build_object(
          'total_matriculas', total_matriculas,
          'total_escolas', total_escolas,
          'total_turmas', total_turmas,
          'totalMatriculasAtivas', total_ativas,
          'desistentes', total_desistentes,
          'alunosComDeficiencia', alunos_deficiencia,
          'alunosTransporteEscolar', alunos_transporte
        ) FROM metricas_base) AS metricas,

        /* Totais coerentes */
        (SELECT jsonb_build_object(
          'capacidade_total', capacidade_total,
          'total_matriculas_ativas', total_matriculas_ativas,
          'total_vagas', total_vagas
        ) FROM capacidade_agg) AS totals_agg,

        /* Por zona coerente */
        (SELECT jsonb_object_agg(zona, jsonb_build_object(
            'capacidade', capacidade,
            'matriculas_ativas', matriculas_ativas,
            'vagas', vagas
        )) FROM capacidade_por_zona) AS capacidade_por_zona,

        /* Quebras */
        (SELECT jsonb_object_agg(sexo, total) FROM por_sexo) AS por_sexo,
        (SELECT jsonb_object_agg(turno, total) FROM por_turno) AS por_turno,
        (SELECT jsonb_object_agg(situacao, total) FROM por_situacao) AS por_situacao,
        (SELECT jsonb_object_agg(zona, total) FROM por_zona_aluno) AS por_zona
      ;
    `;

    const { rows } = await pool.query(sql, params);
    const row = rows[0] || {};

    const metricas = row.metricas || {};
    const totalsAgg = row.totals_agg || {};
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

      capacidadeTotal: Number(totalsAgg.capacidade_total) || 0,
      totalVagas: Number(totalsAgg.total_vagas) || 0,
      taxaOcupacao: 0,
      taxaEvasao: (() => {
        const total = Number(metricas.total_matriculas) || 0;
        const des = Number(metricas.desistentes) || 0;
        return total > 0 ? Number(((des / total) * 100).toFixed(2)) : 0;
      })(),
      ultimaAtualizacao: new Date().toISOString(),
    };

    // Força consistência entre totais e zonas
    enforceConsistencyTotals(responseData);

    cache.set(cacheKey, responseData);
    return res.json(responseData);
  } catch (err) {
    console.error('[analyticsController] buscarAnalytics error:', err);
    return res.status(500).json({ error: 'Erro ao buscar analytics', details: err?.message, stack: err?.stack });
  }
};

/**
 * Alertas de ocupação por escola
 */
const buscarAlertas = async (req, res) => {
  try {
    const filters = req.body || {};
    const { clause, params } = buildWhereClause(filters, req.user);
    const cacheKey = generateCacheKey('alertas', filters, req.user);

    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const sql = `
      WITH base AS (
        SELECT * FROM dados_matriculas WHERE ${clause}
      ),
      turmas AS (
        SELECT DISTINCT escola, idescola, idturma, limite_maximo_aluno
        FROM base
        WHERE idturma IS NOT NULL AND idturma != 0
      ),
      total_matriculas_por_escola AS (
        SELECT 
          idescola, 
          COUNT(*) AS qtde_matriculas
        FROM base
        WHERE UPPER(COALESCE(situacao_matricula,'')) IN ('ATIVO','ATIVA')
           OR COALESCE(idsituacao,0) = 0
        GROUP BY idescola
      ),
      escolas_detalhes AS (
        SELECT 
          t.escola,
          t.idescola,
          t.zona_escola,
          COUNT(t.idturma) AS qtde_turmas,
          COALESCE(tm.qtde_matriculas, 0) AS qtde_matriculas,
          SUM(COALESCE(t.limite_maximo_aluno, 0)) AS capacidade_total,
          GREATEST(SUM(COALESCE(t.limite_maximo_aluno, 0)) - COALESCE(tm.qtde_matriculas, 0), 0) AS vagas_disponiveis
        FROM base t
        LEFT JOIN total_matriculas_por_escola tm ON t.idescola = tm.idescola
        WHERE t.idescola IS NOT NULL
        GROUP BY t.escola, t.idescola, t.zona_escola, tm.qtde_matriculas
      ),
      ocupacao_escola AS (
        SELECT
          idescola,
          escola,
          CASE WHEN UPPER(COALESCE(zona_escola,'')) LIKE '%RUR%' THEN 'RURAL' ELSE 'URBANA' END AS zona,
          capacidade_total,
          qtde_matriculas AS matriculas_ativas,
          CASE 
            WHEN capacidade_total > 0 THEN ROUND((qtde_matriculas::decimal / capacidade_total::decimal) * 100, 2)
            ELSE 0
          END AS taxa_ocupacao
        FROM escolas_detalhes
      )
      SELECT
        jsonb_agg(o.*) FILTER (WHERE o.taxa_ocupacao > 100) AS acima_100,
        jsonb_agg(o.*) FILTER (WHERE o.taxa_ocupacao < 60) AS abaixo_60
      FROM ocupacao_escola o;
    `;

    const { rows } = await pool.query(sql, params);
    const row = rows[0] || {};
    const payload = {
      acima100: row.acima_100 || [],
      abaixo60: row.abaixo_60 || [],
      ultimaAtualizacao: new Date().toISOString(),
    };

    cache.set(cacheKey, payload);
    return res.json(payload);
  } catch (err) {
    console.error('[analyticsController] buscarAlertas error:', err);
    return res.status(500).json({ error: 'Erro ao buscar alertas', details: err?.message, stack: err?.stack });
  }
};

module.exports = {
  buscarAnalytics,
  buscarAlertas,
};