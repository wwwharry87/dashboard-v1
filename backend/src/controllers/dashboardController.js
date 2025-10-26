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
 * Totais (COM DADOS URBANA/RURAL PARA ENTRADAS, SAÍDAS E EVASÃO)
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

    // QUERY ATUALIZADA com dados Urbana/Rural para Entradas, Saídas e Evasão
    const query = `
      WITH base_filtrada AS (
        SELECT * FROM dados_matriculas WHERE ${clause}
      ),

      base_sem_especiais AS (
        SELECT * FROM base_filtrada WHERE COALESCE(idetapa_matricula,0) NOT IN (98,99)
      ),

      /* >>> CORREÇÃO: Usando a mesma lógica do controller antigo para cálculo de capacidade */
      turmas AS (
        SELECT DISTINCT escola, idescola, idturma, limite_maximo_aluno, zona_escola
        FROM base_sem_especiais
        WHERE idturma IS NOT NULL AND idturma != 0
      ),

      /* >>> CORREÇÃO: Matrículas ativas usando mesma definição do antigo */
      total_matriculas_por_escola AS (
        SELECT 
          idescola, 
          COUNT(*) AS qtde_matriculas
        FROM base_sem_especiais
        WHERE UPPER(COALESCE(situacao_matricula,'')) IN ('ATIVO','ATIVA')
           OR COALESCE(idsituacao,0) = 0
        GROUP BY idescola
      ),

      /* >>> CORREÇÃO: Cálculo de escolas detalhes igual ao antigo */
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

      /* Totais gerais */
      totais AS (
        SELECT 
          COUNT(DISTINCT idmatricula) AS total_matriculas,
          COUNT(DISTINCT idescola) AS total_escolas,
          COUNT(DISTINCT idmatricula) FILTER (WHERE entrada_mes_tipo IS NOT NULL AND entrada_mes_tipo != '-') AS total_entradas,
          COUNT(DISTINCT idmatricula) FILTER (WHERE saida_mes_situacao IS NOT NULL AND saida_mes_situacao != '-') AS total_saidas
        FROM base_sem_especiais
      ),

      /* >>> NOVO: Entradas por zona_aluno */
      entradas_por_zona AS (
        SELECT 
          COALESCE(zona_aluno, 'Sem informação') AS zona,
          COUNT(DISTINCT idmatricula) AS total
        FROM base_sem_especiais
        WHERE entrada_mes_tipo IS NOT NULL AND entrada_mes_tipo != '-'
        GROUP BY COALESCE(zona_aluno, 'Sem informação')
      ),

      /* >>> NOVO: Saídas por zona_aluno */
      saidas_por_zona AS (
        SELECT 
          COALESCE(zona_aluno, 'Sem informação') AS zona,
          COUNT(DISTINCT idmatricula) AS total
        FROM base_sem_especiais
        WHERE saida_mes_situacao IS NOT NULL AND saida_mes_situacao != '-'
        GROUP BY COALESCE(zona_aluno, 'Sem informação')
      ),

      /* >>> NOVO: Desistentes por zona_aluno (para cálculo de evasão por zona) */
      desistentes_por_zona AS (
        SELECT 
          COALESCE(zona_aluno, 'Sem informação') AS zona,
          COUNT(DISTINCT idmatricula) AS total_desistentes,
          COUNT(DISTINCT idmatricula) AS total_matriculas_zona
        FROM base_sem_especiais
        WHERE COALESCE(idsituacao,0) = 2
        GROUP BY COALESCE(zona_aluno, 'Sem informação')
      ),

      /* Totais de capacidade baseados nas escolas */
      capacidade_agg AS (
        SELECT
          COALESCE(SUM(capacidade_total), 0) AS capacidade_total,
          COALESCE(SUM(qtde_matriculas), 0) AS total_matriculas_ativas,
          COALESCE(SUM(vagas_disponiveis), 0) AS total_vagas
        FROM escolas_detalhes
      ),

      /* Turmas distintas para contagem */
      turmas_distintas AS (
        SELECT DISTINCT idturma, escola, zona_escola
        FROM base_filtrada
        WHERE idturma IS NOT NULL AND inep IS NOT NULL
      ),

      turmas_por_zona AS (
        SELECT
          COALESCE(zona_escola, 'TOTAL') AS zona,
          COUNT(*) AS qtd_turmas
        FROM turmas_distintas
        GROUP BY ROLLUP (zona_escola)
      ),

      /* Movimentação mensal */
      meses AS (SELECT LPAD(generate_series(1,12)::text, 2, '0') AS mes),

      meses_entrada AS (
        SELECT 
          LPAD(SUBSTRING(entrada_mes_tipo, 1, 2), 2, '0') AS mes,
          COUNT(DISTINCT idmatricula) AS entradas
        FROM base_sem_especiais
        WHERE entrada_mes_tipo IS NOT NULL 
          AND entrada_mes_tipo <> '-'
          AND SUBSTRING(entrada_mes_tipo, 1, 2) ~ '^[0-9]+$'
        GROUP BY SUBSTRING(entrada_mes_tipo, 1, 2)
      ),
      meses_saida AS (
        SELECT 
          LPAD(SUBSTRING(saida_mes_situacao, 1, 2), 2, '0') AS mes,
          COUNT(DISTINCT idmatricula) AS saidas
        FROM base_sem_especiais
        WHERE saida_mes_situacao IS NOT NULL 
          AND saida_mes_situacao <> '-'
          AND SUBSTRING(saida_mes_situacao, 1, 2) ~ '^[0-9]+$'
        GROUP BY SUBSTRING(saida_mes_situacao, 1, 2)
      ),
      movimentacao_mensal AS (
        SELECT 
          m.mes,
          COALESCE(me.entradas, 0) AS entradas,
          COALESCE(ms.saidas, 0) AS saidas
        FROM meses m
        LEFT JOIN meses_entrada me ON me.mes = m.mes
        LEFT JOIN meses_saida ms ON ms.mes = m.mes
        ORDER BY m.mes::int
      ),

      /* >>> CORREÇÃO: Cálculo de taxas igual ao antigo */
      taxas AS (
        SELECT 
          CASE 
            WHEN (SELECT total_matriculas_ativas FROM capacidade_agg) > 0 
            THEN ROUND(
              (SELECT COUNT(DISTINCT idmatricula) FROM base_sem_especiais WHERE COALESCE(idsituacao,0) = 2) * 100.0 / 
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

      /* >>> NOVO: Cálculo de taxa de evasão por zona */
      taxas_evasao_por_zona AS (
        SELECT
          dz.zona,
          COALESCE(dz.total_desistentes, 0) AS desistentes,
          COALESCE(mz.total, 0) AS total_matriculas_zona,
          CASE 
            WHEN COALESCE(mz.total, 0) > 0 
            THEN ROUND((COALESCE(dz.total_desistentes, 0) * 100.0 / mz.total), 2)
            ELSE 0
          END AS taxa_evasao_zona
        FROM desistentes_por_zona dz
        LEFT JOIN (
          SELECT COALESCE(zona_aluno, 'Sem informação') AS zona, COUNT(DISTINCT idmatricula) AS total
          FROM base_sem_especiais
          GROUP BY COALESCE(zona_aluno, 'Sem informação')
        ) mz ON dz.zona = mz.zona
      ),

      /* >>> CORREÇÃO: Capacidade por zona baseada nas escolas */
      capacidade_por_zona AS (
        SELECT
          COALESCE(zona_escola, 'Sem informação') AS zona,
          COALESCE(SUM(capacidade_total), 0) AS capacidade,
          COALESCE(SUM(qtde_matriculas), 0) AS matriculas_ativas,
          COALESCE(SUM(vagas_disponiveis), 0) AS vagas
        FROM escolas_detalhes
        GROUP BY COALESCE(zona_escola, 'Sem informação')
      ),

      /* Quebras por aluno */
      matriculas_por_zona AS (
        SELECT COALESCE(zona_aluno, 'Sem informação') AS label, COUNT(DISTINCT idmatricula) AS total 
        FROM base_sem_especiais
        GROUP BY COALESCE(zona_aluno, 'Sem informação')
      ),
      matriculas_por_sexo AS (
        SELECT COALESCE(sexo, 'Sem informação') AS label, COUNT(DISTINCT idmatricula) AS total
        FROM base_sem_especiais
        GROUP BY COALESCE(sexo, 'Sem informação')
      ),
      matriculas_por_turno AS (
        SELECT COALESCE(turno, 'Sem informação') AS label, COUNT(DISTINCT idmatricula) AS total
        FROM base_sem_especiais
        GROUP BY COALESCE(turno, 'Sem informação')
      ),
      matriculas_por_situacao AS (
        SELECT COALESCE(situacao_matricula, 'Sem informação') AS label, COUNT(DISTINCT idmatricula) AS total
        FROM base_sem_especiais
        GROUP BY COALESCE(situacao_matricula, 'Sem informação')
      ),
      escolas_por_zona AS (
        SELECT COALESCE(zona_escola, 'Sem informação') AS label, COUNT(DISTINCT idescola) AS total
        FROM base_sem_especiais
        GROUP BY COALESCE(zona_escola, 'Sem informação')
      ),

      ultima_atualizacao AS (
        SELECT MAX(ultima_atualizacao) AS ultima_atualizacao 
        FROM dados_matriculas
        LIMIT 1
      )

      SELECT 
        /* Totais globais */
        (SELECT total_matriculas FROM totais) AS total_matriculas,
        (SELECT total_escolas FROM totais) AS total_escolas,
        (SELECT COUNT(*) FROM turmas_distintas) AS total_turmas,

        /* Totais de capacidade */
        (SELECT capacidade_total FROM capacidade_agg) AS capacidade_total,
        (SELECT total_vagas FROM capacidade_agg) AS total_vagas,
        (SELECT total_matriculas_ativas FROM capacidade_agg) AS total_matriculas_ativas,

        /* Outras métricas */
        (SELECT total_entradas FROM totais) AS total_entradas,
        (SELECT total_saidas FROM totais) AS total_saidas,
        (SELECT COUNT(DISTINCT idmatricula) FROM base_sem_especiais WHERE deficiencia = 'SIM') AS alunos_deficiencia,
        (SELECT COUNT(DISTINCT idmatricula) FROM base_sem_especiais WHERE transporte_escolar = 'SIM') AS alunos_transporte,

        (SELECT taxa_evasao FROM taxas) AS taxa_evasao,
        (SELECT taxa_ocupacao FROM taxas) AS taxa_ocupacao,

        /* Movimentação mensal */
        (SELECT COALESCE(json_object_agg(mes, json_build_object('entradas', entradas, 'saidas', saidas)),'{}'::json) 
           FROM movimentacao_mensal) AS entradas_saidas_por_mes,

        /* >>> NOVO: Entradas por zona */
        (SELECT COALESCE(json_object_agg(zona, total), '{}'::json) FROM entradas_por_zona) AS entradas_por_zona,

        /* >>> NOVO: Saídas por zona */
        (SELECT COALESCE(json_object_agg(zona, total), '{}'::json) FROM saidas_por_zona) AS saidas_por_zona,

        /* >>> NOVO: Taxa de evasão por zona */
        (SELECT COALESCE(json_object_agg(zona, json_build_object(
          'desistentes', desistentes,
          'total_matriculas', total_matriculas_zona,
          'taxa_evasao', taxa_evasao_zona
        )), '{}'::json) FROM taxas_evasao_por_zona) AS evasao_por_zona,

        /* Turmas por zona para cards Urbana/Rural */
        (SELECT COALESCE(json_object_agg(zona, qtd_turmas), '{}'::json) 
         FROM turmas_por_zona 
         WHERE zona != 'TOTAL') AS turmas_por_zona,
        (SELECT qtd_turmas FROM turmas_por_zona WHERE zona = 'TOTAL') AS total_turmas_validacao,

        /* Capacidade por zona */
        (SELECT COALESCE(json_object_agg(
                  zona, 
                  json_build_object(
                    'capacidade', capacidade,
                    'matriculas_ativas', matriculas_ativas,
                    'vagas', vagas
                  )
                ), '{}'::json)
         FROM capacidade_por_zona) AS capacidade_por_zona,

        /* Tabela de escolas */
        (SELECT COALESCE(json_agg(json_build_object(
          'idescola', idescola,
          'escola', escola,
          'zona_escola', zona_escola,
          'qtde_turmas', qtde_turmas,
          'qtde_matriculas', qtde_matriculas,
          'capacidade_total', capacidade_total,
          'vagas_disponiveis', vagas_disponiveis,
          'taxa_ocupacao', CASE WHEN capacidade_total > 0 THEN ROUND((qtde_matriculas::decimal / capacidade_total::decimal) * 100, 2) ELSE 0 END,
          'status_vagas', CASE WHEN vagas_disponiveis >= 0 THEN 'disponivel' ELSE 'excedido' END
        ) ORDER BY qtde_matriculas DESC), '[]'::json) FROM escolas_detalhes) AS escolas,

        /* Quebras por aluno */
        (SELECT COALESCE(json_object_agg(label, total), '{}'::json) FROM matriculas_por_zona) AS matriculas_por_zona,
        (SELECT COALESCE(json_object_agg(label, total), '{}'::json) FROM matriculas_por_sexo) AS matriculas_por_sexo,
        (SELECT COALESCE(json_object_agg(label, total), '{}'::json) FROM matriculas_por_turno) AS matriculas_por_turno,
        (SELECT COALESCE(json_object_agg(label, total), '{}'::json) FROM matriculas_por_situacao) AS matriculas_por_situacao,
        (SELECT COALESCE(json_object_agg(label, total), '{}'::json) FROM escolas_por_zona) AS escolas_por_zona,

        /* Última atualização */
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

    // >>> CORREÇÃO: Preparar dados para os cards Urbana/Rural
    const turmasUrbana = row.turmas_por_zona?.['URBANA'] || 0;
    const turmasRural = row.turmas_por_zona?.['RURAL'] || 0;
    const matriculasUrbana = row.matriculas_por_zona?.['URBANA'] || 0;
    const matriculasRural = row.matriculas_por_zona?.['RURAL'] || 0;
    const escolasUrbana = row.escolas_por_zona?.['URBANA'] || 0;
    const escolasRural = row.escolas_por_zona?.['RURAL'] || 0;
    const capacidadeUrbana = row.capacidade_por_zona?.['URBANA']?.capacidade || 0;
    const capacidadeRural = row.capacidade_por_zona?.['RURAL']?.capacidade || 0;
    const vagasUrbana = row.capacidade_por_zona?.['URBANA']?.vagas || 0;
    const vagasRural = row.capacidade_por_zona?.['RURAL']?.vagas || 0;
    
    // >>> NOVO: Dados para Entradas e Saídas por zona_aluno
    const entradasUrbana = row.entradas_por_zona?.['URBANA'] || 0;
    const entradasRural = row.entradas_por_zona?.['RURAL'] || 0;
    const saidasUrbana = row.saidas_por_zona?.['URBANA'] || 0;
    const saidasRural = row.saidas_por_zona?.['RURAL'] || 0;
    
    // >>> NOVO: Dados para Taxa de Evasão por zona_aluno
    const evasaoUrbana = row.evasao_por_zona?.['URBANA']?.taxa_evasao || 0;
    const evasaoRural = row.evasao_por_zona?.['RURAL']?.taxa_evasao || 0;
    const desistentesUrbana = row.evasao_por_zona?.['URBANA']?.desistentes || 0;
    const desistentesRural = row.evasao_por_zona?.['RURAL']?.desistentes || 0;

    // >>> CORREÇÃO: ResponseData com campos em camelCase para o frontend
    const responseData = {
      // Totais principais (camelCase)
      totalMatriculas: parseInt(row.total_matriculas) || 0,
      totalEscolas: parseInt(row.total_escolas) || 0,
      totalTurmas: totalTurmasValidacao > 0 ? totalTurmasValidacao : totalTurmasOriginal,

      // Capacidade e vagas (camelCase)
      capacidadeTotal: parseInt(row.capacidade_total) || 0,
      totalVagas: parseInt(row.total_vagas) || 0,
      totalMatriculasAtivas: parseInt(row.total_matriculas_ativas) || 0,

      // Outras métricas (camelCase)
      totalEntradas: parseInt(row.total_entradas) || 0,
      totalSaidas: parseInt(row.total_saidas) || 0,
      alunosComDeficiencia: parseInt(row.alunos_deficiencia) || 0,
      alunosTransporteEscolar: parseInt(row.alunos_transporte) || 0,
      taxaEvasao: parseFloat(row.taxa_evasao) || 0,
      taxaOcupacao: parseFloat(row.taxa_ocupacao) || 0,

      // Dados para gráficos e tabelas
      entradasSaidasPorMes: row.entradas_saidas_por_mes || {},
      turmasPorZona: row.turmas_por_zona || {},
      capacidadePorZona: row.capacidade_por_zona || {},
      escolas: row.escolas || [],
      matriculasPorZona: row.matriculas_por_zona || {},
      matriculasPorSexo: row.matriculas_por_sexo || {},
      matriculasPorTurno: row.matriculas_por_turno || {},
      matriculasPorSituacao: row.matriculas_por_situacao || {},
      escolasPorZona: row.escolas_por_zona || {},
      ultimaAtualizacao: row.ultima_atualizacao,

      // >>> ATUALIZADO: Dados calculados para os detalhes dos cards (URBANA/RURAL)
      detalhesZona: {
        matriculas: { 
          urbana: matriculasUrbana, 
          rural: matriculasRural 
        },
        escolas: { 
          urbana: escolasUrbana, 
          rural: escolasRural 
        },
        turmas: { 
          urbana: turmasUrbana, 
          rural: turmasRural 
        },
        capacidade: {
          urbana: capacidadeUrbana,
          rural: capacidadeRural
        },
        vagas: {
          urbana: vagasUrbana,
          rural: vagasRural
        },
        // >>> NOVO: Dados para Entradas e Saídas
        entradas: {
          urbana: entradasUrbana,
          rural: entradasRural
        },
        saidas: {
          urbana: saidasUrbana,
          rural: saidasRural
        },
        // >>> NOVO: Dados para Taxa de Evasão
        evasao: {
          urbana: evasaoUrbana,
          rural: evasaoRural,
          desistentes: {
            urbana: desistentesUrbana,
            rural: desistentesRural
          }
        }
      }
    };

    console.log('Dados processados para frontend:', {
      capacidadeTotal: responseData.capacidadeTotal,
      totalVagas: responseData.totalVagas,
      entradasUrbana: entradasUrbana,
      entradasRural: entradasRural,
      saidasUrbana: saidasUrbana,
      saidasRural: saidasRural,
      evasaoUrbana: evasaoUrbana,
      evasaoRural: evasaoRural
    });

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
    res.status(500).json({ 
      error: "Erro ao buscar dados da dashboard", 
      details: err.message, 
      stack: err.stack 
    });
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