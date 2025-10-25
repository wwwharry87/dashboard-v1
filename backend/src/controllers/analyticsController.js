// analyticsController.js (consistente)
// Substitua seu arquivo por este se quiser a versão com consistência de totais e agregações robustas.
// Caso você já tenha queries específicas, você pode manter suas CTEs e apenas garantir que o
// bloco enforceConsistencyTotals(responseData) execute antes do res.json(responseData).

'use strict';

const pool = require('../config/db');
const NodeCache = require('node-cache');

// Reutiliza cache (5 min)
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Reutiliza utilitários do dashboard (filtros e chave de cache)
const { buildWhereClause, generateCacheKey } = require('./dashboardController');

/**
 * Enforce: capacidadeTotal = soma(capacidadePorZona.*.capacidade)
 *          totalVagas      = soma(capacidadePorZona.*.vagas) OU (capacidadeTotal - totalMatriculasAtivas)
 *          totalMatriculasAtivas (se vier por zona) prioriza a soma das zonas
 *          taxaOcupacao    = totalMatriculasAtivas / capacidadeTotal * 100
 */
function enforceConsistencyTotals(r) {
  if (!r || typeof r !== 'object') return r;

  const zonas = r.capacidadePorZona || {};
  const sumZona = (obj, field) =>
    Object.values(obj || {}).reduce((acc, z) => acc + (Number(z?.[field]) || 0), 0);

  const sane = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

  const capZona   = sumZona(zonas, 'capacidade');
  const vagasZona = sumZona(zonas, 'vagas');
  const ativasZona= sumZona(zonas, 'matriculas_ativas');

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
 * Converte listas do tipo ["ATIVO","DESISTENTE"] para ('ATIVO','DESISTENTE') de forma segura.
 */
function toSqlList(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return '(' + list.map((s) => `'${String(s).replace(/'/g, "''")}'`).join(',') + ')';
}

/**
 * Controller principal de analytics.
 * Aceita filtros via body: { idcliente, anoLetivo, zona, turno, sexo, situacao, escolaId, escolaNome, dataIni, dataFim }
 * OBS: Depende do buildWhereClause do seu dashboardController para coerência de filtros entre endpoints.
 */
const buscarAnalytics = async (req, res) => {
  try {
    const filters = req.body || {};
    const clause = buildWhereClause(filters); // mantém sua lógica centralizada
    const cacheKey = generateCacheKey('analytics', filters);

    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // =========================
    //  SQL geral (PostgreSQL)
    // =========================
    // Pressupõe uma tabela única "dados_matriculas" contendo:
    // idcliente, ano_letivo, idescola, escola, zona_escola, idturma, situacao, sexo, turno,
    // capacidade (por escola ou por linha), data_entrada, data_saida, deficiencia, transporte
    //
    // Se seus nomes forem diferentes, ajuste o SELECT/CTEs abaixo.
    const sql = `
      WITH base AS (
        SELECT *
        FROM dados_matriculas
        WHERE ${clause}
      ),
      -- Dedup capacidade por escola (usa o MAIOR valor visto para evitar somas duplicadas linha-a-linha)
      cap_por_escola AS (
        SELECT
          COALESCE(CAST(idescola AS TEXT), escola) AS escola_key,
          MAX(COALESCE(capacidade,0)) AS capacidade,
          MAX(zona_escola) AS zona
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
        SELECT
          UPPER(sexo) AS sexo,
          COUNT(*) AS total
        FROM base
        GROUP BY 1
      ),
      por_turno AS (
        SELECT
          UPPER(turno) AS turno,
          COUNT(*) AS total
        FROM base
        GROUP BY 1
      ),
      por_situacao AS (
        SELECT
          UPPER(situacao) AS situacao,
          COUNT(*) AS total
        FROM base
        GROUP BY 1
      ),
      por_zona AS (
        SELECT
          CASE WHEN UPPER(zona_escola) LIKE '%RUR%' THEN 'RURAL' ELSE 'URBANA' END AS zona,
          COUNT(*) AS total
        FROM base
        GROUP BY 1
      ),
      entradas_mes AS (
        SELECT
          TO_CHAR(CAST(data_entrada AS DATE), 'MM') AS mes,
          COUNT(*) AS entradas
        FROM base
        WHERE data_entrada IS NOT NULL
        GROUP BY 1
      ),
      saidas_mes AS (
        SELECT
          TO_CHAR(CAST(data_saida AS DATE), 'MM') AS mes,
          COUNT(*) AS saidas
        FROM base
        WHERE data_saida IS NOT NULL
        GROUP BY 1
      ),
      entradas_saidas AS (
        SELECT
          COALESCE(e.mes, s.mes) AS mes,
          COALESCE(e.entradas,0) AS entradas,
          COALESCE(s.saidas,0) AS saidas
        FROM entradas_mes e
        FULL OUTER JOIN saidas_mes s ON s.mes = e.mes
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
        (SELECT jsonb_object_agg(mes, jsonb_build_object('entradas', entradas, 'saidas', saidas)) FROM entradas_saidas) AS entradas_saidas
      ;
    `;

    const { rows } = await pool.query(sql);
    const row = rows[0] || {};

    // Monta o payload em formato semelhante ao dashboard
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

      // Derivados (serão ajustados por enforceConsistencyTotals)
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

/**
 * Exemplo de alertas de ocupação por escola (se necessário).
 * Retorna escolas acima de 100% de ocupação ou abaixo de 60% (ajuste thresholds).
 */
const buscarAlertas = async (req, res) => {
  try {
    const filters = req.body || {};
    const clause = buildWhereClause(filters);
    const cacheKey = generateCacheKey('alertas', filters);

    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const sql = `
      WITH base AS (
        SELECT * FROM dados_matriculas WHERE ${clause}
      ),
      cap_por_escola AS (
        SELECT
          COALESCE(CAST(idescola AS TEXT), escola) AS escola_key,
          MAX(COALESCE(capacidade,0)) AS capacidade,
          MAX(zona_escola) AS zona,
          MAX(escola) AS escola_nome
        FROM base
        GROUP BY COALESCE(CAST(idescola AS TEXT), escola)
      ),
      ativas_por_escola AS (
        SELECT
          COALESCE(CAST(idescola AS TEXT), escola) AS escola_key,
          COUNT(*) AS ativas
        FROM base
        WHERE UPPER(situacao) IN ('ATIVO','ATIVA','MATRICULADO')
        GROUP BY COALESCE(CAST(idescola AS TEXT), escola)
      ),
      ocupacao_escola AS (
        SELECT
          c.escola_key, c.escola_nome,
          CASE WHEN UPPER(c.zona) LIKE '%RUR%' THEN 'RURAL' ELSE 'URBANA' END AS zona,
          c.capacidade,
          COALESCE(a.ativas,0) AS matriculas_ativas,
          CASE 
            WHEN c.capacidade > 0 
            THEN ROUND((COALESCE(a.ativas,0)::decimal / c.capacidade::decimal) * 100, 2)
            ELSE 0
          END AS taxa_ocupacao
        FROM cap_por_escola c
        LEFT JOIN ativas_por_escola a ON a.escola_key = c.escola_key
      )
      SELECT
        jsonb_agg(o.*) FILTER (WHERE o.taxa_ocupacao > 100) AS acima_100,
        jsonb_agg(o.*) FILTER (WHERE o.taxa_ocupacao < 60)  AS abaixo_60
      FROM ocupacao_escola o;
    `;

    const { rows } = await pool.query(sql);
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
    return res.status(500).json({ error: 'Erro ao buscar alertas', details: err?.message });
  }
};

module.exports = {
  buscarAnalytics,
  buscarAlertas,
};
