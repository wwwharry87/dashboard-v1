// dashboardController.js 
const pool = require('../config/db');
const NodeCache = require('node-cache');

// Configuração do cache
const cache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60
});

const clientField = 'idcliente';

/* ============================================================
 * Helpers
 * ============================================================ */
const buildWhereClause = (filters, user) => {
  const whereClauses = ["1=1"];
  const params = [];

  const addFilter = (value, field, castTo = null) => {
    if (value !== undefined && value !== null && value !== "") {
      params.push(value);
      if (castTo) {
        whereClauses.push(`${field} = $${params.length}::${castTo}`);
      } else {
        whereClauses.push(`${field} = $${params.length}`);
      }
    }
  };

  const addArrayFilter = (values, field) => {
    if (values && Array.isArray(values) && values.length > 0) {
      params.push(values);
      whereClauses.push(`${field} = ANY($${params.length}::integer[])`);
    } else if (values && values !== "") {
      params.push(values);
      whereClauses.push(`${field} = $${params.length}`);
    }
  };

  // ano_letivo como INTEGER
  if (filters.anoLetivo !== undefined && filters.anoLetivo !== null && filters.anoLetivo !== "") {
    params.push(parseInt(filters.anoLetivo) || filters.anoLetivo);
    whereClauses.push(`ano_letivo = $${params.length}::integer`);
  }

  addFilter(filters.deficiencia, "deficiencia");
  addFilter(filters.grupoEtapa, "grupo_etapa");
  addFilter(filters.etapaMatricula, "etapa_matricula");
  addFilter(filters.etapaTurma, "etapa_turma");
  addFilter(filters.multisserie, "multisserie");
  addFilter(filters.situacaoMatricula, "situacao_matricula");
  addFilter(filters.tipoMatricula, "tipo_matricula");
  addFilter(filters.tipoTransporte, "tipo_transporte");
  addFilter(filters.transporteEscolar, "transporte_escolar");

  // idescola como INTEGER
  if (filters.idescola !== undefined && filters.idescola !== null && filters.idescola !== "") {
    params.push(parseInt(filters.idescola) || filters.idescola);
    whereClauses.push(`idescola = $${params.length}::integer`);
  }

  // Filtro multi-tenant (prioriza usuário autenticado)
  let clientFilterApplied = false;
  if (user) {
    if (user.clientId !== undefined && user.clientId !== null && user.clientId !== "") {
      params.push(parseInt(user.clientId) || user.clientId);
      whereClauses.push(`${clientField} = $${params.length}::integer`);
      clientFilterApplied = true;
    } else if (user.allowedClients && user.allowedClients.length > 0) {
      addArrayFilter(user.allowedClients, clientField);
      clientFilterApplied = true;
    }
  }
  if (!clientFilterApplied && filters.idcliente !== undefined && filters.idcliente !== null && filters.idcliente !== "") {
    params.push(parseInt(filters.idcliente) || filters.idcliente);
    whereClauses.push(`${clientField} = $${params.length}::integer`);
  }

  return { clause: whereClauses.join(" AND "), params };
};

const generateCacheKey = (prefix, filters, user) => {
  const userKey = user ? (user.clientId || (user.allowedClients ? user.allowedClients.join(',') : '')) : '';
  return `${prefix}_${userKey}_${Object.entries(filters)
    .filter(([_, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}:${value}`)
    .sort()
    .join('_')}`;
};

/* ============================================================
 * Filtros
 * ============================================================ */
const buscarFiltros = async (req, res) => {
  try {
    const cacheKey = generateCacheKey('filtros', {}, req.user);
    const cachedFilters = cache.get(cacheKey);
    if (cachedFilters) return res.json(cachedFilters);

    const { clause, params } = buildWhereClause({}, req.user);

    const query = `
      WITH base_filtrada AS (
        SELECT * FROM dados_matriculas WHERE ${clause}
      )
      SELECT 
        (SELECT array_agg(DISTINCT ano_letivo ORDER BY ano_letivo DESC) FROM base_filtrada WHERE ano_letivo IS NOT NULL) AS ano_letivo,
        (SELECT array_agg(DISTINCT deficiencia) FROM base_filtrada WHERE deficiencia IS NOT NULL) AS deficiencia,
        (SELECT array_agg(DISTINCT grupo_etapa) FROM base_filtrada WHERE grupo_etapa IS NOT NULL) AS grupo_etapa,
        (SELECT array_agg(DISTINCT etapa_matricula) FROM base_filtrada WHERE etapa_matricula IS NOT NULL) AS etapa_matricula,
        (SELECT array_agg(DISTINCT etapa_turma) FROM base_filtrada WHERE etapa_turma IS NOT NULL) AS etapa_turma,
        (SELECT array_agg(DISTINCT multisserie) FROM base_filtrada WHERE multisserie IS NOT NULL) AS multisserie,
        (SELECT array_agg(DISTINCT situacao_matricula) FROM base_filtrada) AS situacao_matricula,
        (SELECT array_agg(DISTINCT tipo_matricula) FROM base_filtrada WHERE tipo_matricula IS NOT NULL) AS tipo_matricula,
        (SELECT array_agg(DISTINCT tipo_transporte) FROM base_filtrada WHERE tipo_transporte IS NOT NULL) AS tipo_transporte,
        (SELECT array_agg(DISTINCT transporte_escolar) FROM base_filtrada WHERE transporte_escolar IS NOT NULL) AS transporte_escolar
    `;

    const result = await pool.query(query, params);
    const row = result.rows[0] || {};

    const response = {
      ano_letivo: row.ano_letivo || [],
      deficiencia: row.deficiencia || [],
      grupo_etapa: row.grupo_etapa || [],
      etapa_matricula: row.etapa_matricula || [],
      etapa_turma: row.etapa_turma || [],
      multisserie: row.multisserie || [],
      situacao_matricula: row.situacao_matricula || [],
      tipo_matricula: row.tipo_matricula || [],
      tipo_transporte: row.tipo_transporte || [],
      transporte_escolar: row.transporte_escolar || []
    };

    cache.set(cacheKey, response, 3600);
    res.json(response);
  } catch (err) {
    console.error("Erro ao buscar filtros:", err);
    res.status(500).json({ error: "Erro ao buscar filtros", details: err.message, stack: err.stack });
  }
};

/* ============================================================
 * Totais (com queries corrigidas)
 * ============================================================ */
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

    const query = `
  WITH base_filtrada AS (
    SELECT * FROM dados_matriculas WHERE ${clause}
  ),
  base_sem_especiais AS (
    SELECT * FROM base_filtrada WHERE COALESCE(idetapa_matricula,0) NOT IN (98,99)
  ),
  matriculas_ativas AS (
    SELECT * FROM base_sem_especiais
    WHERE UPPER(COALESCE(situacao_matricula,'')) IN ('ATIVO','ATIVA')
       OR COALESCE(idsituacao,0) = 0
  ),
  turmas_agrupadas AS (
    SELECT DISTINCT
      idescola,
      idturma,
      COALESCE(limite_maximo_aluno, 0) AS capacidade_turma
    FROM base_filtrada
    WHERE idturma IS NOT NULL AND idturma != 0
      AND idescola IS NOT NULL AND idescola != 0
  ),
  matriculas_ativas_por_escola AS (
    SELECT idescola, COUNT(DISTINCT idmatricula) AS ativos_escola
    FROM matriculas_ativas
    GROUP BY idescola
  ),
  escolas_detalhes AS (
    SELECT 
      b.idescola,
      MIN(b.escola) AS escola,
      MIN(b.zona_escola) AS zona_escola,
      COUNT(DISTINCT ta.idturma) AS qtde_turmas,
      COALESCE(mae.ativos_escola, 0) AS qtde_matriculas,
      COALESCE(SUM(ta.capacidade_turma), 0) AS capacidade_total,
      GREATEST(COALESCE(SUM(ta.capacidade_turma), 0) - COALESCE(mae.ativos_escola, 0), 0) AS vagas_disponiveis
    FROM base_filtrada b
    LEFT JOIN turmas_agrupadas ta ON ta.idescola = b.idescola
    LEFT JOIN matriculas_ativas_por_escola mae ON mae.idescola = b.idescola
    WHERE b.idescola IS NOT NULL
    GROUP BY b.idescola, mae.ativos_escola
  ),
  capacidade_agg AS (
    SELECT
      COALESCE(SUM(capacidade_total), 0) AS capacidade_total,
      COALESCE(SUM(qtde_matriculas), 0) AS total_matriculas_ativas,
      COALESCE(SUM(vagas_disponiveis), 0) AS total_vagas
    FROM escolas_detalhes
  ),
  turmas_distintas AS (
    SELECT DISTINCT idturma, escola, zona_escola
    FROM base_filtrada
    WHERE idturma IS NOT NULL AND inep IS NOT NULL
  ),
  turmas_por_zona AS (
    SELECT
      COALESCE(zona_escola, 'TOTAL') AS zona,
      COUNT(*) AS qtd_turmas
    FROM (
      SELECT DISTINCT idturma, COALESCE(zona_escola, 'Sem informação') AS zona_escola
      FROM turmas_distintas
    ) t
    GROUP BY ROLLUP (zona)
  ),
  meses AS (SELECT LPAD(generate_series(1,12)::text, 2, '0') AS mes),
  meses_entrada AS (
    SELECT LPAD(SUBSTRING(entrada_mes_tipo, 1, 2), 2, '0') AS mes,
           COUNT(DISTINCT idmatricula) AS entradas
    FROM base_sem_especiais
    WHERE entrada_mes_tipo IS NOT NULL 
      AND entrada_mes_tipo <> '-'
      AND SUBSTRING(entrada_mes_tipo, 1, 2) ~ '^[0-9]+$'
    GROUP BY SUBSTRING(entrada_mes_tipo, 1, 2)
  ),
  meses_saida AS (
    SELECT LPAD(SUBSTRING(saida_mes_situacao, 1, 2), 2, '0') AS mes,
           COUNT(DISTINCT idmatricula) AS saidas
    FROM base_sem_especiais
    WHERE saida_mes_situacao IS NOT NULL 
      AND saida_mes_situacao <> '-'
      AND SUBSTRING(saida_mes_situacao, 1, 2) ~ '^[0-9]+$'
    GROUP BY SUBSTRING(saida_mes_situacao, 1, 2)
  ),
  movimentacao_mensal AS (
    SELECT m.mes,
           COALESCE(me.entradas, 0) AS entradas,
           COALESCE(ms.saidas, 0) AS saidas
    FROM meses m
    LEFT JOIN meses_entrada me ON me.mes = m.mes
    LEFT JOIN meses_saida ms ON ms.mes = m.mes
    ORDER BY m.mes::int
  ),
  matriculas_desistentes AS (
    SELECT * FROM base_sem_especiais WHERE COALESCE(idsituacao,0) = 2
  ),
  taxas AS (
    SELECT 
      CASE 
        WHEN (SELECT total_matriculas_ativas FROM capacidade_agg) > 0 
        THEN ROUND(
          (SELECT COUNT(DISTINCT idmatricula) FROM matriculas_desistentes) * 100.0 / 
          (SELECT total_matriculas_ativas FROM capacidade_agg), 2
        )
        ELSE 0 
      END AS taxa_evasao,
      CASE 
        WHEN (SELECT capacidade_total FROM capacidade_agg) > 0 
        THEN ROUND(
          (SELECT total_matriculas_ativas FROM capacidade_agg) * 100.0 / 
          (SELECT capacidade_total FROM capacidade_agg), 2
        )
        ELSE 0 
      END AS taxa_ocupacao
  ),
  capacidade_por_zona AS (
    SELECT
      COALESCE(zona_escola, 'Sem informação') AS label,
      COALESCE(SUM(capacidade_total), 0) AS capacidade,
      COALESCE(SUM(qtde_matriculas), 0) AS matriculas_ativas,
      COALESCE(SUM(vagas_disponiveis), 0) AS vagas
    FROM escolas_detalhes
    GROUP BY COALESCE(zona_escola, 'Sem informação')
  ),
  todas_matriculas AS (SELECT * FROM base_sem_especiais),
  matriculas_por_zona AS (
    SELECT COALESCE(zona_aluno, 'Sem informação') AS label, COUNT(DISTINCT idmatricula) AS total 
    FROM todas_matriculas
    GROUP BY COALESCE(zona_aluno, 'Sem informação')
  ),
  matriculas_por_sexo AS (
    SELECT COALESCE(sexo, 'Sem informação') AS label, COUNT(DISTINCT idmatricula) AS total
    FROM todas_matriculas
    GROUP BY COALESCE(sexo, 'Sem informação')
  ),
  matriculas_por_turno AS (
    SELECT COALESCE(turno, 'Sem informação') AS label, COUNT(DISTINCT idmatricula) AS total
    FROM todas_matriculas
    GROUP BY COALESCE(turno, 'Sem informação')
  ),
  matriculas_por_situacao AS (
    SELECT COALESCE(situacao_matricula, 'Sem informação') AS label,
           COUNT(DISTINCT idmatricula) AS total
    FROM todas_matriculas
    GROUP BY COALESCE(situacao_matricula, 'Sem informação')
  ),
  escolas_por_zona AS (
    SELECT COALESCE(zona_escola, 'Sem informação') AS label, COUNT(DISTINCT idescola) AS total
    FROM todas_matriculas
    GROUP BY COALESCE(zona_escola, 'Sem informação')
  ),
  entradas_por_zona AS (
    SELECT COALESCE(zona_aluno, 'Sem informação') AS label,
           COUNT(DISTINCT idmatricula) AS entradas
    FROM base_sem_especiais
    WHERE entrada_mes_tipo IS NOT NULL AND entrada_mes_tipo <> '-'
    GROUP BY COALESCE(zona_aluno, 'Sem informação')
  ),
  saidas_por_zona AS (
    SELECT COALESCE(zona_aluno, 'Sem informação') AS label,
           COUNT(DISTINCT idmatricula) AS saidas
    FROM base_sem_especiais
    WHERE saida_mes_situacao IS NOT NULL AND saida_mes_situacao <> '-'
    GROUP BY COALESCE(zona_aluno, 'Sem informação')
  ),
  entradas_saidas_por_zona AS (
    SELECT COALESCE(e.label, s.label) AS label,
           COALESCE(e.entradas, 0) AS entradas,
           COALESCE(s.saidas, 0) AS saidas
    FROM entradas_por_zona e
    FULL JOIN saidas_por_zona s ON s.label = e.label
  ),
  ultima_atualizacao AS (
    SELECT MAX(ultima_atualizacao) AS ultima_atualizacao 
    FROM dados_matriculas
    LIMIT 1
  )
  SELECT 
    (SELECT COUNT(DISTINCT idmatricula) FROM todas_matriculas) AS total_matriculas,
    (SELECT COUNT(DISTINCT idescola) FROM todas_matriculas) AS total_escolas,
    (SELECT COUNT(*) FROM turmas_distintas) AS total_turmas,
    (SELECT capacidade_total FROM capacidade_agg) AS capacidade_total,
    (SELECT total_vagas FROM capacidade_agg) AS total_vagas,
    (SELECT total_matriculas_ativas FROM capacidade_agg) AS total_matriculas_ativas,
    (SELECT COUNT(DISTINCT idmatricula)
       FROM todas_matriculas
      WHERE entrada_mes_tipo IS NOT NULL AND entrada_mes_tipo <> '-') AS total_entradas,
    (SELECT COUNT(DISTINCT idmatricula) FROM base_sem_especiais WHERE COALESCE(idsituacao,0) > 0) AS total_saidas,
    (SELECT COUNT(DISTINCT idmatricula) FROM todas_matriculas WHERE deficiencia = 'SIM') AS alunos_deficiencia,
    (SELECT COUNT(DISTINCT idmatricula) FROM todas_matriculas WHERE transporte_escolar = 'SIM') AS alunos_transporte,
    (SELECT taxa_evasao FROM taxas) AS taxa_evasao,
    (SELECT taxa_ocupacao FROM taxas) AS taxa_ocupacao,
    (SELECT COALESCE(json_object_agg(mes, json_build_object('entradas', entradas, 'saidas', saidas)),'{}'::json) 
       FROM movimentacao_mensal) AS entradas_saidas_por_mes,
    (SELECT COALESCE(json_object_agg(zona, qtd_turmas), '{}'::json) 
     FROM turmas_por_zona 
     WHERE zona != 'TOTAL') AS turmas_por_zona,
    (SELECT qtd_turmas FROM turmas_por_zona WHERE zona = 'TOTAL') AS total_turmas_validacao,
    (SELECT COALESCE(json_object_agg(
              label, 
              json_build_object(
                'capacidade', capacidade,
                'matriculas_ativas', matriculas_ativas,
                'vagas', vagas
              )
            ), '{}'::json)
     FROM capacidade_por_zona) AS capacidade_por_zona,
    (SELECT COALESCE(json_object_agg(label, total), '{}'::json) FROM matriculas_por_zona) AS matriculas_por_zona,
    (SELECT COALESCE(json_object_agg(label, total), '{}'::json) FROM matriculas_por_sexo) AS matriculas_por_sexo,
    (SELECT COALESCE(json_object_agg(label, total), '{}'::json) FROM matriculas_por_turno) AS matriculas_por_turno,
    (SELECT COALESCE(json_object_agg(label, total), '{}'::json) FROM matriculas_por_situacao) AS matriculas_por_situacao,
    (SELECT COALESCE(json_object_agg(label, total), '{}'::json) FROM escolas_por_zona) AS escolas_por_zona,
    (SELECT COALESCE(json_object_agg(label, json_build_object('entradas', entradas, 'saidas', saidas)), '{}'::json)
       FROM entradas_saidas_por_zona) AS entradas_saidas_por_zona,
    (SELECT ultima_atualizacao FROM ultima_atualizacao) AS ultima_atualizacao
`;

    const result = await pool.query(query, params);
    const row = result.rows[0];

    // Validação turmas
    const totalTurmasValidacao = parseInt(row.total_turmas_validacao) || 0;
    const totalTurmasOriginal = parseInt(row.total_turmas) || 0;

    console.log('Validação de turmas:', {
      totalTurmasOriginal,
      totalTurmasValidacao,
      batem: totalTurmasOriginal === totalTurmasValidacao
    });

    const responseData = {
      totalMatriculas: parseInt(row.total_matriculas) || 0,
      totalEscolas: parseInt(row.total_escolas) || 0,
      totalTurmas: totalTurmasValidacao > 0 ? totalTurmasValidacao : totalTurmasOriginal,

      /* >>> CORREÇÃO: Totais coerentes vindos da soma por escola */
      capacidadeTotal: parseInt(row.capacidade_total) || 0,
      totalVagas: parseInt(row.total_vagas) || 0,
      totalMatriculasAtivas: parseInt(row.total_matriculas_ativas) || 0,

      totalEntradas: parseInt(row.total_entradas) || 0,
      totalSaidas: parseInt(row.total_saidas) || 0,
      alunosComDeficiencia: parseInt(row.alunos_deficiencia) || 0,
      alunosTransporteEscolar: parseInt(row.alunos_transporte) || 0,
      taxaEvasao: parseFloat(row.taxa_evasao) || 0,
      taxaOcupacao: parseFloat(row.taxa_ocupacao) || 0,
      entradasSaidasPorMes: row.entradas_saidas_por_mes || {},

      turmasPorZona: row.turmas_por_zona || {},
      capacidadePorZona: row.capacidade_por_zona || {},

      escolas: row.escolas || [],
      matriculasPorZona: row.matriculas_por_zona || {},
      matriculasPorSexo: row.matriculas_por_sexo || {},
      matriculasPorTurno: row.matriculas_por_turno || {},
      matriculasPorSituacao: row.matriculas_por_situacao || {},
      escolasPorZona: row.escolas_por_zona || {},
      entradasSaidasPorZona: row.entradas_saidas_por_zona || {},
      ultimaAtualizacao: row.ultima_atualizacao
    };

    // CONSISTÊNCIA entre total e zonas (mantido)
    const sumZona = (obj, field) =>
      Object.values(obj || {}).reduce((acc, z) => acc + (Number(z?.[field]) || 0), 0);

    (function enforceConsistencyTotals(r) {
      const capZona = sumZona(r.capacidadePorZona, 'capacidade');
      const vagasZona = sumZona(r.capacidadePorZona, 'vagas');
      const ativasZona = sumZona(r.capacidadePorZona, 'matriculas_ativas');

      if (capZona > 0) r.capacidadeTotal = capZona;
      if (vagasZona >= 0) r.totalVagas = vagasZona;
      if (ativasZona > 0) r.totalMatriculasAtivas = ativasZona;

      r.taxaOcupacao = r.capacidadeTotal > 0
        ? Number(((r.totalMatriculasAtivas * 100) / r.capacidadeTotal).toFixed(2))
        : 0;

      const sane = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
      r.capacidadeTotal = sane(r.capacidadeTotal);
      r.totalVagas = sane(r.totalVagas);
      r.totalMatriculasAtivas = sane(r.totalMatriculasAtivas);
      r.taxaOcupacao = sane(r.taxaOcupacao);
    })(responseData);

    cache.set(cacheKey, responseData);
    res.json(responseData);

  } catch (err) {
    console.error("Erro ao buscar totais:", err);
    res.status(500).json({ error: "Erro ao buscar dados da dashboard", details: err.message, stack: err.stack });
  }
};

/* ============================================================
 * Breakdowns (todas as situações)
 * ============================================================ */
const buscarBreakdowns = async (req, res) => {
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

    const cacheKey = generateCacheKey('breakdowns', filters, req.user);
    const cachedData = cache.get(cacheKey);
    if (cachedData) return res.json(cachedData);

    const { clause, params } = buildWhereClause(filters, req.user);

    const query = `
      WITH base_filtrada AS (
        SELECT * FROM dados_matriculas WHERE ${clause}
      ),
      base_sem_especiais AS (
        SELECT * FROM base_filtrada WHERE COALESCE(idetapa_matricula,0) NOT IN (98,99)
      ),
      todas_matriculas AS (
        SELECT * FROM base_sem_especiais
      ),
      matriculas_por_zona AS (
        SELECT COALESCE(zona_aluno, 'Sem informação') AS label, COUNT(DISTINCT idmatricula) AS total 
        FROM todas_matriculas
        GROUP BY COALESCE(zona_aluno, 'Sem informação')
      ),
      matriculas_por_sexo AS (
        SELECT COALESCE(sexo, 'Sem informação') AS label, COUNT(DISTINCT idmatricula) AS total
        FROM todas_matriculas
        GROUP BY COALESCE(sexo, 'Sem informação')
      ),
      matriculas_por_turno AS (
        SELECT COALESCE(turno, 'Sem informação') AS label, COUNT(DISTINCT idmatricula) AS total
        FROM todas_matriculas
        GROUP BY COALESCE(turno, 'Sem informação')
      ),
      matriculas_por_situacao AS (
        SELECT COALESCE(situacao_matricula, 'Sem informação') AS label, COUNT(DISTINCT idmatricula) AS total
        FROM todas_matriculas
        GROUP BY COALESCE(situacao_matricula, 'Sem informação')
      )
      SELECT 
        (SELECT COALESCE(json_object_agg(label, total), '{}'::json) FROM matriculas_por_zona) AS matriculas_por_zona,
        (SELECT COALESCE(json_object_agg(label, total), '{}'::json) FROM matriculas_por_sexo) AS matriculas_por_sexo,
        (SELECT COALESCE(json_object_agg(label, total), '{}'::json) FROM matriculas_por_turno) AS matriculas_por_turno,
        (SELECT COALESCE(json_object_agg(label, total), '{}'::json) FROM matriculas_por_situacao) AS matriculas_por_situacao
    `;

    const result = await pool.query(query, params);
    const row = result.rows[0] || {};

    const response = {
      matriculasPorZona: row.matriculas_por_zona || {},
      matriculasPorSexo: row.matriculas_por_sexo || {},
      matriculasPorTurno: row.matriculas_por_turno || {},
      matriculasPorSituacao: row.matriculas_por_situacao || {}
    };

    cache.set(cacheKey, response);
    res.json(response);
  } catch (err) {
    console.error("Erro ao buscar breakdowns:", err);
    res.status(500).json({ error: "Erro ao buscar breakdowns", details: err.message, stack: err.stack });
  }
};

/* ============================================================
 * Debug/Validação
 * ============================================================ */
const validarCapacidades = async (req, res) => {
  try {
    const filters = req.body || {};
    const { clause, params } = buildWhereClause(filters, req.user);

    const debugQuery = `
      WITH base_filtrada AS (SELECT * FROM dados_matriculas WHERE ${clause}),
      turmas_sample AS (
        SELECT idescola, idturma, limite_maximo_aluno, COUNT(*) as registros
        FROM base_filtrada 
        WHERE idturma IS NOT NULL
        GROUP BY idescola, idturma, limite_maximo_aluno
        ORDER BY registros DESC
        LIMIT 10
      )
      SELECT * FROM turmas_sample;
    `;

    const result = await pool.query(debugQuery, params);
    
    res.json({
      message: "Debug de capacidades",
      sample_turmas: result.rows,
      total_params: params.length,
      where_clause: clause
    });
  } catch (err) {
    console.error("Erro no debug:", err);
    res.status(500).json({ error: "Erro no debug", details: err.message });
  }
};

/* ============================================================
 * Cache
 * ============================================================ */
const limparCache = (req, res) => {
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
  generateCacheKey,
  validarCapacidades
};