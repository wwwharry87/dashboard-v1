// analyticsController.js (consistente com dashboardController)
'use strict';

const pool = require('../config/db');
const NodeCache = require('node-cache');

// Cache (5 min)
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Reutiliza utilitários do dashboard (filtros e chave de cache)
const { buildWhereClause, generateCacheKey } = require('./dashboardController');

/**
 * Garante consistência:
 *  capacidadeTotal = soma(capacidadePorZona.*.capacidade)
 *  totalVagas      = soma(capacidadePorZona.*.vagas)
 *  totalMatriculasAtivas = soma(capacidadePorZona.*.matriculas_ativas)
 *  taxaOcupacao    = totalMatriculasAtivas / capacidadeTotal * 100
 */
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

  // Saneia outros agregados comuns se existirem
  r.totalMatriculas = sane(r.totalMatriculas);
  r.totalEscolas    = sane(r.totalEscolas);
  r.totalTurmas     = sane(r.totalTurmas);
  r.taxaEvasao      = sane(r.taxaEvasao);

  return r;
}

/**
 * Controller principal de analytics
 * Filtros no body: { idcliente, anoLetivo, ... } — delega parsing ao buildWhereClause
 * Alinhado ao dashboard: usa limite_maximo_aluno, situacao_matricula, entrada_mes_tipo, saida_mes_situacao
 */
const buscarAnalytics = async (req, res) => {
  try {
    const filters = req.body || {};
    const { clause, params } = buildWhereClause(filters, req.user);
    const cacheKey = generateCacheKey('analytics', filters, req.user);

    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const sql = `
      WITH base AS (
        SELECT *
        FROM dados_matriculas
        WHERE ${clause}
      ),

      base_sem_especiais AS (
        SELECT *
        FROM base
        WHERE COALESCE(idetapa_matricula,0) NOT IN (98,99)
      ),

      /* Ativos: aceita 'ATIVO'/'ATIVA' e idsituacao=0 */
      matriculas_ativas AS (
        SELECT *
        FROM base_sem_especiais
        WHERE UPPER(COALESCE(situacao_matricula,'')) IN ('ATIVO','ATIVA')
           OR COALESCE(idsituacao,0) = 0
      ),

      /* Capacidade por TURMA (MAX para não inflar) */
      turmas_agrupadas AS (
        SELECT 
          idescola,
          idturma,
          MAX(COALESCE(limite_maximo_aluno,0)) AS capacidade_turma
        FROM base
        WHERE idturma IS NOT NULL
        GROUP BY idescola, idturma
      ),

      /* Ativos distintos por escola */
      ativos_por_escola AS (
        SELECT idescola, COUNT(DISTINCT idmatricula) AS ativos_escola
        FROM matriculas_ativas
        GROUP BY idescola
      ),

      /* Capacidade e vagas por escola (soma de capacidades das turmas dessa escola) */
      escolas_detalhes AS (
        SELECT
          ta.idescola,
          MIN(b.escola)      AS escola,
          MIN(b.zona_escola) AS zona_escola,
          COUNT(DISTINCT ta.idturma)                                AS qtde_turmas,
          COALESCE(ae.ativos_escola, 0)                             AS qtde_matriculas,
          COALESCE(SUM(ta.capacidade_turma), 0)                     AS capacidade_total,
          COALESCE(SUM(ta.capacidade_turma), 0) - COALESCE(ae.ativos_escola, 0) AS vagas_disponiveis
        FROM turmas_agrupadas ta
        LEFT JOIN base b            ON b.idescola = ta.idescola
        LEFT JOIN ativos_por_escola ae ON ae.idescola = ta.idescola
        GROUP BY ta.idescola, ae.ativos_escola
      ),

      /* Totais coerentes: soma das escolas */
      capacidade_agg AS (
        SELECT
          COALESCE(SUM(capacidade_total), 0)  AS capacidade_total,
          COALESCE(SUM(qtde_matriculas), 0)   AS total_matriculas_ativas,
          COALESCE(SUM(vagas_disponiveis), 0) AS total_vagas
        FROM escolas_detalhes
      ),

      /* Capacidades/ativos/vagas POR ZONA a partir das escolas (coerente com os totais) */
      capacidade_por_zona AS (
        SELECT
          COALESCE(zona_escola, 'Sem informação') AS zona,
          COALESCE(SUM(capacidade_total), 0)      AS capacidade,
          COALESCE(SUM(qtde_matriculas), 0)       AS matriculas_ativas,
          COALESCE(SUM(vagas_disponiveis), 0)     AS vagas
        FROM escolas_detalhes
        GROUP BY COALESCE(zona_escola, 'Sem informação')
      ),

      /* Métricas gerais (todas as situações) */
      metricas_base AS (
        SELECT
          COUNT(DISTINCT idmatricula) AS total_matriculas,
          COUNT(DISTINCT idescola)    AS total_escolas,
          COUNT(DISTINCT idturma)     AS total_turmas,
          (SELECT total_matriculas_ativas FROM capacidade_agg)      AS total_ativas,
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

      /* Entradas/Saídas por mês (mesmo padrão do dashboard) */
      meses AS (SELECT LPAD(generate_series(1,12)::text, 2, '0') AS mes),
      entradas_mes AS (
        SELECT 
          LPAD(SUBSTRING(entrada_mes_tipo, 1, 2), 2, '0') AS mes,
          COUNT(DISTINCT idmatricula) AS entradas
        FROM base_sem_especiais
        WHERE entrada_mes_tipo IS NOT NULL 
          AND entrada_mes_tipo <> '-'
          AND SUBSTRING(entrada_mes_tipo, 1, 2) ~ '^[0-9]+$'
        GROUP BY SUBSTRING(entrada_mes_tipo, 1, 2)
      ),
      saidas_mes AS (
        SELECT 
          LPAD(SUBSTRING(saida_mes_situacao, 1, 2), 2, '0') AS mes,
          COUNT(DISTINCT idmatricula) AS saidas
        FROM base_sem_especiais
        WHERE saida_mes_situacao IS NOT NULL 
          AND saida_mes_situacao <> '-'
          AND SUBSTRING(saida_mes_situacao, 1, 2) ~ '^[0-9]+$'
        GROUP BY SUBSTRING(saida_mes_situacao, 1, 2)
      ),
      entradas_saidas AS (
        SELECT 
          m.mes,
          COALESCE(e.entradas,0) AS entradas,
          COALESCE(s.saidas,0)   AS saidas
        FROM meses m
        LEFT JOIN entradas_mes e ON e.mes = m.mes
        LEFT JOIN saidas_mes   s ON s.mes = m.mes
        ORDER BY m.mes::int
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
          'capacidade_total',         capacidade_total,
          'total_matriculas_ativas',  total_matriculas_ativas,
          'total_vagas',              total_vagas
        ) FROM capacidade_agg) AS totals_agg,

        /* Por zona coerente (a partir das escolas) */
        (SELECT jsonb_object_agg(zona, jsonb_build_object(
            'capacidade', capacidade,
            'matriculas_ativas', matriculas_ativas,
            'vagas', vagas
        )) FROM capacidade_por_zona) AS capacidade_por_zona,

        /* Quebras */
        (SELECT jsonb_object_agg(sexo, total)   FROM por_sexo)       AS por_sexo,
        (SELECT jsonb_object_agg(turno, total)  FROM por_turno)      AS por_turno,
        (SELECT jsonb_object_agg(situacao, total) FROM por_situacao) AS por_situacao,
        (SELECT jsonb_object_agg(zona, total)   FROM por_zona_aluno) AS por_zona,

        /* Entradas/Saídas por mês */
        (SELECT jsonb_object_agg(mes, jsonb_build_object('entradas', entradas, 'saidas', saidas))
         FROM entradas_saidas) AS entradas_saidas
      ;
    `;

    const { rows } = await pool.query(sql, params);
    const row = rows[0] || {};

    const metricas = row.metricas || {};
    const totalsAgg = row.totals_agg || {};
    const capacidadePorZona = row.capacidade_por_zona || {};

    const responseData = {
      // métricas base
      totalMatriculas: Number(metricas.total_matriculas) || 0,
      totalEscolas: Number(metricas.total_escolas) || 0,
      totalTurmas: Number(metricas.total_turmas) || 0,
      totalMatriculasAtivas: Number(metricas.totalMatriculasAtivas) || 0,
      alunosComDeficiencia: Number(metricas.alunosComDeficiencia) || 0,
      alunosTransporteEscolar: Number(metricas.alunosTransporteEscolar) || 0,

      // por zona (fonte única para consistência)
      capacidadePorZona: capacidadePorZona || {},

      // quebras
      matriculasPorSexo: row.por_sexo || {},
      matriculasPorTurno: row.por_turno || {},
      matriculasPorSituacao: row.por_situacao || {},
      matriculasPorZona: row.por_zona || {},

      entradasSaidasPorMes: row.entradas_saidas || {},

      // derivados/totais coerentes com soma das escolas (via capacidadePorZona)
      capacidadeTotal: Number(totalsAgg.capacidade_total) || 0,
      totalVagas: Number(totalsAgg.total_vagas) || 0,
      taxaOcupacao: 0,
      taxaEvasao: (() => {
        const total = Number(metricas.total_matriculas) || 0;
        const des   = Number(metricas.desistentes) || 0;
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
 * Alertas de ocupação por escola (excedido/baixo)
 * Usa a mesma base de capacidade (turmas_agrupadas) e ativos distintos
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
      turmas_agrupadas AS (
        SELECT
          idescola,
          idturma,
          MAX(COALESCE(limite_maximo_aluno,0)) AS capacidade_turma
        FROM base
        WHERE idturma IS NOT NULL
        GROUP BY idescola, idturma
      ),
      cap_por_escola AS (
        SELECT
          idescola,
          SUM(capacidade_turma) AS capacidade,
          MAX(escola) AS escola_nome,
          MAX(zona_escola) AS zona
        FROM turmas_agrupadas ta
        LEFT JOIN base b ON b.idescola = ta.idescola
        GROUP BY idescola
      ),
      ativas_por_escola AS (
        SELECT idescola, COUNT(DISTINCT idmatricula) AS ativas
        FROM base
        WHERE UPPER(COALESCE(situacao_matricula,'')) IN ('ATIVO','ATIVA')
           OR COALESCE(idsituacao,0) = 0
        GROUP BY idescola
      ),
      ocupacao_escola AS (
        SELECT
          c.idescola,
          c.escola_nome,
          CASE WHEN UPPER(COALESCE(c.zona,'')) LIKE '%RUR%' THEN 'RURAL' ELSE 'URBANA' END AS zona,
          c.capacidade,
          COALESCE(a.ativas,0) AS matriculas_ativas,
          CASE 
            WHEN c.capacidade > 0 THEN ROUND((COALESCE(a.ativas,0)::decimal / c.capacidade::decimal) * 100, 2)
            ELSE 0
          END AS taxa_ocupacao
        FROM cap_por_escola c
        LEFT JOIN ativas_por_escola a ON a.idescola = c.idescola
      )
      SELECT
        jsonb_agg(o.*) FILTER (WHERE o.taxa_ocupacao > 100) AS acima_100,
        jsonb_agg(o.*) FILTER (WHERE o.taxa_ocupacao < 60)  AS abaixo_60
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
