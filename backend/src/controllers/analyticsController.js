// analyticsController.js - VERSÃO CORRIGIDA
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

    // QUERY ATUALIZADA usando zona_escola e dados consistentes
    const sql = `
      WITH base AS (
        SELECT * FROM dados_matriculas WHERE ${clause}
      ),

      base_sem_especiais AS (
        SELECT * FROM base WHERE COALESCE(idetapa_matricula,0) NOT IN (98,99)
      ),

      /* Mesma lógica do dashboardController para capacidade */
      turmas AS (
        SELECT DISTINCT escola, idescola, idturma, limite_maximo_aluno, zona_escola
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
          t.idescola,
          MIN(t.escola) AS escola,
          MIN(t.zona_escola) AS zona_escola,
          COUNT(t.idturma) AS qtde_turmas,
          COALESCE(tm.qtde_matriculas, 0) AS qtde_matriculas,
          SUM(COALESCE(t.limite_maximo_aluno, 0)) AS capacidade_total,
          GREATEST(SUM(COALESCE(t.limite_maximo_aluno, 0)) - COALESCE(tm.qtde_matriculas, 0), 0) AS vagas_disponiveis
        FROM turmas t
        LEFT JOIN total_matriculas_por_escola tm ON t.idescola = tm.idescola
        WHERE t.idescola IS NOT NULL
        GROUP BY t.idescola, tm.qtde_matriculas
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

      /* >>> CORREÇÃO: Entradas por zona_escola */
      entradas_por_zona AS (
        SELECT 
          COALESCE(dm.zona_escola, 'Sem informação') AS zona,
          COUNT(DISTINCT dm.idmatricula) AS total
        FROM base_sem_especiais dm
        WHERE dm.entrada_mes_tipo IS NOT NULL AND dm.entrada_mes_tipo != '-'
        GROUP BY COALESCE(dm.zona_escola, 'Sem informação')
      ),

      /* >>> CORREÇÃO: Saídas por zona_escola */
      saidas_por_zona AS (
        SELECT 
          COALESCE(dm.zona_escola, 'Sem informação') AS zona,
          COUNT(DISTINCT dm.idmatricula) AS total
        FROM base_sem_especiais dm
        WHERE dm.saida_mes_situacao IS NOT NULL AND dm.saida_mes_situacao != '-'
        GROUP BY COALESCE(dm.zona_escola, 'Sem informação')
      ),

      /* >>> CORREÇÃO: Desistentes por zona_escola */
      desistentes_por_zona AS (
        SELECT 
          COALESCE(dm.zona_escola, 'Sem informação') AS zona,
          COUNT(DISTINCT dm.idmatricula) AS total_desistentes
        FROM base_sem_especiais dm
        WHERE COALESCE(dm.idsituacao,0) = 2
        GROUP BY COALESCE(dm.zona_escola, 'Sem informação')
      ),

      /* >>> CORREÇÃO: Total de matrículas por zona_escola para cálculo de evasão */
      matriculas_por_zona_escola AS (
        SELECT 
          COALESCE(zona_escola, 'Sem informação') AS zona,
          COUNT(DISTINCT idmatricula) AS total_matriculas
        FROM base_sem_especiais
        GROUP BY COALESCE(zona_escola, 'Sem informação')
      ),

      /* >>> CORREÇÃO: Taxa de evasão por zona_escola */
      taxas_evasao_por_zona AS (
        SELECT
          dz.zona,
          COALESCE(dz.total_desistentes, 0) AS desistentes,
          COALESCE(mz.total_matriculas, 0) AS total_matriculas_zona,
          CASE 
            WHEN COALESCE(mz.total_matriculas, 0) > 0 
            THEN ROUND((COALESCE(dz.total_desistentes, 0) * 100.0 / mz.total_matriculas), 2)
            ELSE 0
          END AS taxa_evasao_zona
        FROM desistentes_por_zona dz
        LEFT JOIN matriculas_por_zona_escola mz ON dz.zona = mz.zona
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
      ),

      ultima_atualizacao AS (
        SELECT MAX(ultima_atualizacao) AS ultima_atualizacao 
        FROM dados_matriculas
        LIMIT 1
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

        /* >>> CORREÇÃO: Entradas por zona_escola */
        (SELECT COALESCE(json_object_agg(zona, total), '{}'::json) FROM entradas_por_zona) AS entradas_por_zona,

        /* >>> CORREÇÃO: Saídas por zona_escola */
        (SELECT COALESCE(json_object_agg(zona, total), '{}'::json) FROM saidas_por_zona) AS saidas_por_zona,

        /* >>> CORREÇÃO: Taxa de evasão por zona_escola */
        (SELECT COALESCE(json_object_agg(zona, json_build_object(
          'desistentes', desistentes,
          'total_matriculas', total_matriculas_zona,
          'taxa_evasao', taxa_evasao_zona
        )), '{}'::json) FROM taxas_evasao_por_zona) AS evasao_por_zona,

        /* Quebras */
        (SELECT jsonb_object_agg(sexo, total) FROM por_sexo) AS por_sexo,
        (SELECT jsonb_object_agg(turno, total) FROM por_turno) AS por_turno,
        (SELECT jsonb_object_agg(situacao, total) FROM por_situacao) AS por_situacao,
        (SELECT jsonb_object_agg(zona, total) FROM por_zona_aluno) AS por_zona,

        /* Última atualização */
        (SELECT ultima_atualizacao FROM ultima_atualizacao) AS ultima_atualizacao
      ;
    `;

    const { rows } = await pool.query(sql, params);
    const row = rows[0] || {};

    const metricas = row.metricas || {};
    const totalsAgg = row.totals_agg || {};
    const capacidadePorZona = row.capacidade_por_zona || {};

    // >>> CORREÇÃO: Preparar dados para detalhes de zona
    const entradasUrbana = row.entradas_por_zona?.['URBANA'] || 0;
    const entradasRural = row.entradas_por_zona?.['RURAL'] || 0;
    const saidasUrbana = row.saidas_por_zona?.['URBANA'] || 0;
    const saidasRural = row.saidas_por_zona?.['RURAL'] || 0;
    const evasaoUrbana = row.evasao_por_zona?.['URBANA']?.taxa_evasao || 0;
    const evasaoRural = row.evasao_por_zona?.['RURAL']?.taxa_evasao || 0;

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
      ultimaAtualizacao: row.ultima_atualizacao || new Date().toISOString(),

      // >>> CORREÇÃO: Dados para detalhes de zona (URBANA/RURAL)
      detalhesZona: {
        entradas: {
          urbana: entradasUrbana,
          rural: entradasRural
        },
        saidas: {
          urbana: saidasUrbana,
          rural: saidasRural
        },
        evasao: {
          urbana: evasaoUrbana,
          rural: evasaoRural
        }
      }
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
 * Alertas de ocupação por escola - VERSÃO CORRIGIDA
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

      base_sem_especiais AS (
        SELECT * FROM base WHERE COALESCE(idetapa_matricula,0) NOT IN (98,99)
      ),

      turmas AS (
        SELECT DISTINCT escola, idescola, idturma, limite_maximo_aluno, zona_escola
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
          t.idescola,
          MIN(t.escola) AS escola,
          MIN(t.zona_escola) AS zona_escola,
          COUNT(t.idturma) AS qtde_turmas,
          COALESCE(tm.qtde_matriculas, 0) AS qtde_matriculas,
          SUM(COALESCE(t.limite_maximo_aluno, 0)) AS capacidade_total,
          GREATEST(SUM(COALESCE(t.limite_maximo_aluno, 0)) - COALESCE(tm.qtde_matriculas, 0), 0) AS vagas_disponiveis
        FROM turmas t
        LEFT JOIN total_matriculas_por_escola tm ON t.idescola = tm.idescola
        WHERE t.idescola IS NOT NULL
        GROUP BY t.idescola, tm.qtde_matriculas
      ),

      ocupacao_escola AS (
        SELECT
          idescola,
          escola,
          CASE 
            WHEN UPPER(COALESCE(zona_escola,'')) LIKE '%RUR%' THEN 'RURAL' 
            ELSE 'URBANA' 
          END AS zona,
          capacidade_total,
          qtde_matriculas AS matriculas_ativas,
          CASE 
            WHEN capacidade_total > 0 THEN ROUND((qtde_matriculas::decimal / capacidade_total::decimal) * 100, 2)
            ELSE 0
          END AS taxa_ocupacao,
          vagas_disponiveis
        FROM escolas_detalhes
      )

      SELECT
        jsonb_agg(o.*) FILTER (WHERE o.taxa_ocupacao > 100) AS acima_100,
        jsonb_agg(o.*) FILTER (WHERE o.taxa_ocupacao < 60) AS abaixo_60,
        COUNT(*) FILTER (WHERE o.taxa_ocupacao > 100) AS total_acima_100,
        COUNT(*) FILTER (WHERE o.taxa_ocupacao < 60) AS total_abaixo_60
      FROM ocupacao_escola o;
    `;

    const { rows } = await pool.query(sql, params);
    const row = rows[0] || {};
    
    const payload = {
      acima100: row.acima_100 || [],
      abaixo60: row.abaixo_60 || [],
      totalAcima100: row.total_acima_100 || 0,
      totalAbaixo60: row.total_abaixo_60 || 0,
      ultimaAtualizacao: new Date().toISOString(),
    };

    cache.set(cacheKey, payload);
    return res.json(payload);
  } catch (err) {
    console.error('[analyticsController] buscarAlertas error:', err);
    return res.status(500).json({ error: 'Erro ao buscar alertas', details: err?.message, stack: err?.stack });
  }
};

/**
 * Métricas detalhadas para analytics avançados
 */
const buscarMetricasDetalhadas = async (req, res) => {
  try {
    const filters = req.body || {};
    const { clause, params } = buildWhereClause(filters, req.user);
    const cacheKey = generateCacheKey('metricas_detalhadas', filters, req.user);

    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const sql = `
      WITH base AS (
        SELECT * FROM dados_matriculas WHERE ${clause}
      ),

      base_sem_especiais AS (
        SELECT * FROM base WHERE COALESCE(idetapa_matricula,0) NOT IN (98,99)
      ),

      /* Métricas por etapa de ensino */
      por_etapa AS (
        SELECT 
          COALESCE(etapa_matricula, 'Sem informação') AS etapa,
          COUNT(DISTINCT idmatricula) AS total_matriculas,
          COUNT(DISTINCT idmatricula) FILTER (WHERE COALESCE(idsituacao,0) = 2) AS desistentes
        FROM base_sem_especiais
        GROUP BY COALESCE(etapa_matricula, 'Sem informação')
      ),

      /* Métricas por faixa etária (exemplo simplificado) */
      por_idade AS (
        SELECT 
          CASE 
            WHEN idade BETWEEN 0 AND 5 THEN '0-5 anos'
            WHEN idade BETWEEN 6 AND 10 THEN '6-10 anos'
            WHEN idade BETWEEN 11 AND 14 THEN '11-14 anos'
            WHEN idade BETWEEN 15 AND 17 THEN '15-17 anos'
            WHEN idade >= 18 THEN '18+ anos'
            ELSE 'Sem informação'
          END AS faixa_etaria,
          COUNT(DISTINCT idmatricula) AS total
        FROM base_sem_especiais
        GROUP BY 
          CASE 
            WHEN idade BETWEEN 0 AND 5 THEN '0-5 anos'
            WHEN idade BETWEEN 6 AND 10 THEN '6-10 anos'
            WHEN idade BETWEEN 11 AND 14 THEN '11-14 anos'
            WHEN idade BETWEEN 15 AND 17 THEN '15-17 anos'
            WHEN idade >= 18 THEN '18+ anos'
            ELSE 'Sem informação'
          END
      ),

      /* Evolução mensal de matrículas */
      evolucao_mensal AS (
        SELECT 
          ano_letivo,
          LPAD(SUBSTRING(entrada_mes_tipo, 1, 2), 2, '0') AS mes,
          COUNT(DISTINCT idmatricula) AS matriculas
        FROM base_sem_especiais
        WHERE entrada_mes_tipo IS NOT NULL 
          AND entrada_mes_tipo <> '-'
          AND SUBSTRING(entrada_mes_tipo, 1, 2) ~ '^[0-9]+$'
        GROUP BY ano_letivo, LPAD(SUBSTRING(entrada_mes_tipo, 1, 2), 2, '0')
      ),

      /* Taxa de evasão por turno */
      evasao_por_turno AS (
        SELECT 
          COALESCE(turno, 'Sem informação') AS turno,
          COUNT(DISTINCT idmatricula) FILTER (WHERE COALESCE(idsituacao,0) = 2) AS desistentes,
          COUNT(DISTINCT idmatricula) AS total_matriculas,
          CASE 
            WHEN COUNT(DISTINCT idmatricula) > 0 
            THEN ROUND((COUNT(DISTINCT idmatricula) FILTER (WHERE COALESCE(idsituacao,0) = 2) * 100.0 / COUNT(DISTINCT idmatricula)), 2)
            ELSE 0
          END AS taxa_evasao
        FROM base_sem_especiais
        GROUP BY COALESCE(turno, 'Sem informação')
      )

      SELECT
        /* Métricas por etapa */
        (SELECT COALESCE(json_object_agg(etapa, json_build_object(
          'total_matriculas', total_matriculas,
          'desistentes', desistentes,
          'taxa_evasao', CASE WHEN total_matriculas > 0 THEN ROUND((desistentes * 100.0 / total_matriculas), 2) ELSE 0 END
        )), '{}'::json) FROM por_etapa) AS metricas_etapa,

        /* Faixa etária */
        (SELECT COALESCE(json_object_agg(faixa_etaria, total), '{}'::json) FROM por_idade) AS faixa_etaria,

        /* Evolução mensal */
        (SELECT COALESCE(json_object_agg(
          ano_letivo::text,
          (SELECT json_object_agg(mes, matriculas) 
           FROM evolucao_mensal em2 
           WHERE em2.ano_letivo = em1.ano_letivo 
           AND em2.mes IS NOT NULL)
        ), '{}'::json) 
        FROM (SELECT DISTINCT ano_letivo FROM evolucao_mensal) em1) AS evolucao_mensal,

        /* Evasão por turno */
        (SELECT COALESCE(json_object_agg(turno, json_build_object(
          'desistentes', desistentes,
          'total_matriculas', total_matriculas,
          'taxa_evasao', taxa_evasao
        )), '{}'::json) FROM evasao_por_turno) AS evasao_turno
      ;
    `;

    const { rows } = await pool.query(sql, params);
    const row = rows[0] || {};

    const responseData = {
      metricasEtapa: row.metricas_etapa || {},
      faixaEtaria: row.faixa_etaria || {},
      evolucaoMensal: row.evolucao_mensal || {},
      evasaoTurno: row.evasao_turno || {},
      ultimaAtualizacao: new Date().toISOString(),
    };

    cache.set(cacheKey, responseData);
    return res.json(responseData);
  } catch (err) {
    console.error('[analyticsController] buscarMetricasDetalhadas error:', err);
    return res.status(500).json({ error: 'Erro ao buscar métricas detalhadas', details: err?.message, stack: err?.stack });
  }
};

module.exports = {
  buscarAnalytics,
  buscarAlertas,
  buscarMetricasDetalhadas,
};