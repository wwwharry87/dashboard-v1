//analyticsController.js
const pool = require('../config/db');
const NodeCache = require('node-cache');

// Reutiliza a mesma configuração de cache
const cache = new NodeCache({ 
  stdTTL: 300,
  checkperiod: 60
});

// Reutiliza as mesmas funções do seu controller atual
const { buildWhereClause, generateCacheKey } = require('./dashboardController');

const buscarAnalytics = async (req, res) => {
  try {
    // Extrai os filtros do body (mesma estrutura do buscarTotais)
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

    console.log('BuscarAnalytics - Filtros recebidos:', filters);
    console.log('BuscarAnalytics - Usuário:', req.user);

    // Gera chave de cache baseada nos filtros
    const cacheKey = generateCacheKey('analytics', filters, req.user);
    
    // Verifica cache
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const { clause, params } = buildWhereClause(filters, req.user);

    // CONSULTA SIMPLIFICADA E CORRIGIDA
    const query = `
      WITH base_filtrada AS (
        SELECT * FROM dados_matriculas WHERE ${clause}
      ),
      base_sem_especiais AS (
        SELECT * FROM base_filtrada WHERE idetapa_matricula NOT IN (98,99)
      ),
      -- Métricas Básicas SIMPLIFICADAS
      metricas_base AS (
        SELECT 
          COUNT(*) AS total_matriculas,
          COUNT(DISTINCT idescola) AS total_escolas,
          COUNT(DISTINCT idturma) AS total_turmas,
          COUNT(*) FILTER (WHERE entrada_mes_tipo IS NOT NULL AND entrada_mes_tipo != '-') AS total_entradas,
          COUNT(*) FILTER (WHERE saida_mes_situacao IS NOT NULL AND saida_mes_situacao != '-') AS total_saidas,
          COUNT(*) FILTER (WHERE deficiencia = 'SIM') AS alunos_deficiencia,
          COUNT(*) FILTER (WHERE transporte_escolar = 'SIM') AS alunos_transporte
        FROM base_sem_especiais
      ),
      -- Capacidade do sistema CORRIGIDA
      capacidade_sistema AS (
        SELECT 
          COALESCE(SUM(limite_maximo_aluno), 0) AS capacidade_total
        FROM (
          SELECT DISTINCT idescola, idturma, limite_maximo_aluno
          FROM base_sem_especiais
          WHERE limite_maximo_aluno IS NOT NULL AND limite_maximo_aluno > 0
        ) turmas_unicas
      ),
      -- Taxas calculadas de forma SEGURA
      taxas_calculadas AS (
        SELECT 
          -- Taxa de Evasão CORRIGIDA: (saídas / matrículas) * 100
          CASE 
            WHEN (SELECT total_matriculas FROM metricas_base) > 0
            THEN ROUND(
              (SELECT total_saidas FROM metricas_base) * 100.0 / 
              NULLIF((SELECT total_matriculas FROM metricas_base), 0), 
              2
            )
            ELSE 0
          END AS taxa_evasao,
          
          -- Taxa de Ocupação CORRIGIDA: (matrículas / capacidade) * 100
          CASE 
            WHEN (SELECT capacidade_total FROM capacidade_sistema) > 0
            THEN ROUND(
              (SELECT total_matriculas FROM metricas_base) * 100.0 / 
              NULLIF((SELECT capacidade_total FROM capacidade_sistema), 0), 
              2
            )
            ELSE 0
          END AS taxa_ocupacao
      ),
      -- Distribuição por Zona CORRIGIDA
      distribuicao_zona AS (
        SELECT 
          COUNT(*) FILTER (WHERE zona_escola = 'URBANA') AS matriculas_urbana,
          COUNT(*) FILTER (WHERE zona_escola = 'RURAL') AS matriculas_rural,
          COUNT(DISTINCT idescola) FILTER (WHERE zona_escola = 'URBANA') AS escolas_urbana,
          COUNT(DISTINCT idescola) FILTER (WHERE zona_escola = 'RURAL') AS escolas_rural,
          COUNT(DISTINCT idturma) FILTER (WHERE zona_escola = 'URBANA') AS turmas_urbana,
          COUNT(DISTINCT idturma) FILTER (WHERE zona_escola = 'RURAL') AS turmas_rural
        FROM base_sem_especiais
      ),
      -- Situação da Matrícula
      situacao_matriculas AS (
        SELECT 
          COALESCE(situacao_matricula, 'NAO_INFORMADO') as situacao,
          COUNT(*) as total
        FROM base_sem_especiais
        GROUP BY situacao_matricula
      ),
      -- Turnos
      turno_matriculas AS (
        SELECT 
          COALESCE(turno, 'NAO_INFORMADO') as turno,
          COUNT(*) as total
        FROM base_sem_especiais
        GROUP BY turno
      ),
      -- Sexo
      sexo_matriculas AS (
        SELECT 
          COALESCE(sexo, 'NAO_INFORMADO') as sexo,
          COUNT(*) as total
        FROM base_sem_especiais
        GROUP BY sexo
      ),
      -- Evolução Mensal SIMPLIFICADA
      evolucao_mensal AS (
        SELECT 
          CASE 
            WHEN SUBSTRING(entrada_mes_tipo, 1, 2) ~ '^[0-9]+$' 
            THEN LPAD(SUBSTRING(entrada_mes_tipo, 1, 2), 2, '0')
            ELSE '00'
          END AS mes,
          COUNT(*) as matriculas_mes
        FROM base_sem_especiais
        WHERE entrada_mes_tipo IS NOT NULL AND entrada_mes_tipo != '-'
          AND SUBSTRING(entrada_mes_tipo, 1, 2) ~ '^[0-9]+$'
        GROUP BY SUBSTRING(entrada_mes_tipo, 1, 2)
        ORDER BY mes
        LIMIT 12
      ),
      -- Escolas para tabela
      escolas_detalhes AS (
        SELECT 
          idescola,
          MAX(escola) as escola,
          MAX(zona_escola) as zona_escola,
          COUNT(*) as total_matriculas,
          COUNT(DISTINCT idturma) as total_turmas,
          COUNT(*) FILTER (WHERE saida_mes_situacao IS NOT NULL AND saida_mes_situacao != '-') as total_saidas,
          COALESCE(SUM(limite_maximo_aluno), 0) as capacidade_total
        FROM base_sem_especiais
        GROUP BY idescola
      )
      SELECT 
        -- Métricas Base
        (SELECT total_matriculas FROM metricas_base) as total_matriculas,
        (SELECT total_escolas FROM metricas_base) as total_escolas,
        (SELECT total_turmas FROM metricas_base) as total_turmas,
        (SELECT total_entradas FROM metricas_base) as total_entradas,
        (SELECT total_saidas FROM metricas_base) as total_saidas,
        (SELECT alunos_deficiencia FROM metricas_base) as alunos_deficiencia,
        (SELECT alunos_transporte FROM metricas_base) as alunos_transporte,
        (SELECT capacidade_total FROM capacidade_sistema) as capacidade_total,
        (SELECT (SELECT capacidade_total FROM capacidade_sistema) - (SELECT total_matriculas FROM metricas_base)) as vagas_disponiveis,
        
        -- Taxas CORRIGIDAS
        (SELECT taxa_evasao FROM taxas_calculadas) as taxa_evasao,
        (SELECT taxa_ocupacao FROM taxas_calculadas) as taxa_ocupacao,
        
        -- Distribuição por Zona
        (SELECT matriculas_urbana FROM distribuicao_zona) as matriculas_urbana,
        (SELECT matriculas_rural FROM distribuicao_zona) as matriculas_rural,
        (SELECT escolas_urbana FROM distribuicao_zona) as escolas_urbana,
        (SELECT escolas_rural FROM distribuicao_zona) as escolas_rural,
        (SELECT turmas_urbana FROM distribuicao_zona) as turmas_urbana,
        (SELECT turmas_rural FROM distribuicao_zona) as turmas_rural,
        
        -- Dados para gráficos
        (SELECT COALESCE(json_object_agg(situacao, total), '{}'::json) FROM situacao_matriculas) as matriculas_por_situacao,
        (SELECT COALESCE(json_object_agg(turno, total), '{}'::json) FROM turno_matriculas) as matriculas_por_turno,
        (SELECT COALESCE(json_object_agg(sexo, total), '{}'::json) FROM sexo_matriculas) as matriculas_por_sexo,
        (SELECT COALESCE(json_object_agg(mes, matriculas_mes), '{}'::json) FROM evolucao_mensal) as evolucao_matriculas,
        
        -- Escolas para tabela
        (SELECT COALESCE(json_agg(json_build_object(
          'idescola', idescola,
          'escola', escola,
          'zona_escola', zona_escola,
          'qtde_matriculas', total_matriculas,
          'qtde_turmas', total_turmas,
          'qtde_saidas', total_saidas,
          'capacidade_total', capacidade_total,
          'vagas_disponiveis', capacidade_total - total_matriculas,
          'taxa_ocupacao_escola', 
            CASE 
              WHEN capacidade_total > 0 THEN ROUND((total_matriculas * 100.0 / capacidade_total), 2)
              ELSE 0
            END,
          'taxa_evasao_escola',
            CASE 
              WHEN total_matriculas > 0 THEN ROUND((total_saidas * 100.0 / total_matriculas), 2)
              ELSE 0
            END
        )), '[]'::json) FROM escolas_detalhes) as escolas
    `;

    const result = await pool.query(query, params);
    const row = result.rows[0];

    console.log('Dados brutos da consulta:', {
      total_matriculas: row.total_matriculas,
      total_saidas: row.total_saidas,
      taxa_evasao: row.taxa_evasao,
      taxa_ocupacao: row.taxa_ocupacao,
      capacidade_total: row.capacidade_total
    });

    // CORREÇÃO: Processamento seguro dos dados
    const safeParse = (value, defaultValue = 0) => {
      if (value === null || value === undefined || value === 'NaN' || isNaN(value)) {
        return defaultValue;
      }
      const num = typeof value === 'string' ? parseFloat(value) : value;
      return isNaN(num) ? defaultValue : num;
    };

    // Processamento dos dados CORRIGIDO
    const responseData = {
      // Métricas Base
      totalMatriculas: safeParse(row.total_matriculas, 0),
      totalEscolas: safeParse(row.total_escolas, 0),
      totalTurmas: safeParse(row.total_turmas, 0),
      totalEntradas: safeParse(row.total_entradas, 0),
      totalSaidas: safeParse(row.total_saidas, 0),
      alunosComDeficiencia: safeParse(row.alunos_deficiencia, 0),
      alunosTransporteEscolar: safeParse(row.alunos_transporte, 0),
      capacidadeTotal: safeParse(row.capacidade_total, 0),
      totalVagas: safeParse(row.vagas_disponiveis, 0),
      
      // Taxas Estratégicas - CORREÇÃO PRINCIPAL
      taxaEvasao: safeParse(row.taxa_evasao, 0),
      taxaOcupacao: safeParse(row.taxa_ocupacao, 0),
      
      // Distribuição por Zona
      matriculasPorZona: {
        URBANA: safeParse(row.matriculas_urbana, 0),
        RURAL: safeParse(row.matriculas_rural, 0)
      },
      escolasPorZona: {
        URBANA: safeParse(row.escolas_urbana, 0),
        RURAL: safeParse(row.escolas_rural, 0)
      },
      turmasPorZona: {
        URBANA: safeParse(row.turmas_urbana, 0),
        RURAL: safeParse(row.turmas_rural, 0)
      },
      
      // Dados para gráficos
      matriculasPorSituacao: row.matriculas_por_situacao || {},
      matriculasPorTurno: row.matriculas_por_turno || {},
      matriculasPorSexo: row.matriculas_por_sexo || {},
      evolucaoMatriculas: row.evolucao_matriculas || {},
      
      // Escolas para tabela
      escolas: row.escolas || [],
      
      // Timestamp de atualização
      ultimaAtualizacao: new Date().toISOString()
    };

    // CORREÇÃO: Cálculos de backup para garantir que as taxas existam
    if (responseData.taxaEvasao === 0 && responseData.totalMatriculas > 0) {
      responseData.taxaEvasao = parseFloat(
        (responseData.totalSaidas * 100 / responseData.totalMatriculas).toFixed(2)
      );
    }

    if (responseData.taxaOcupacao === 0 && responseData.capacidadeTotal > 0) {
      responseData.taxaOcupacao = parseFloat(
        (responseData.totalMatriculas * 100 / responseData.capacidadeTotal).toFixed(2)
      );
    }

    // Limitar taxas entre 0 e 100
    responseData.taxaEvasao = Math.min(100, Math.max(0, responseData.taxaEvasao));
    responseData.taxaOcupacao = Math.min(100, Math.max(0, responseData.taxaOcupacao));

    // Armazena em cache
    cache.set(cacheKey, responseData);
    
    console.log('Analytics retornados com sucesso:', {
      totalMatriculas: responseData.totalMatriculas,
      totalSaidas: responseData.totalSaidas,
      taxaEvasao: responseData.taxaEvasao,
      taxaOcupacao: responseData.taxaOcupacao,
      capacidadeTotal: responseData.capacidadeTotal
    });
    
    res.json(responseData);
  } catch (err) {
    console.error("Erro ao buscar analytics:", err);
    
    // CORREÇÃO: Retornar dados padrão em caso de erro
    const errorResponse = {
      totalMatriculas: 0,
      totalEscolas: 0,
      totalTurmas: 0,
      totalEntradas: 0,
      totalSaidas: 0,
      alunosComDeficiencia: 0,
      alunosTransporteEscolar: 0,
      capacidadeTotal: 0,
      totalVagas: 0,
      taxaEvasao: 0,
      taxaOcupacao: 0,
      matriculasPorZona: { URBANA: 0, RURAL: 0 },
      escolasPorZona: { URBANA: 0, RURAL: 0 },
      turmasPorZona: { URBANA: 0, RURAL: 0 },
      matriculasPorSituacao: {},
      matriculasPorTurno: {},
      matriculasPorSexo: {},
      evolucaoMatriculas: {},
      escolas: [],
      ultimaAtualizacao: new Date().toISOString(),
      error: "Erro ao carregar dados"
    };
    
    res.status(500).json(errorResponse);
  }
};

// Endpoint específico para alertas CORRIGIDO
const buscarAlertas = async (req, res) => {
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

    const cacheKey = generateCacheKey('alertas', filters, req.user);
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const { clause, params } = buildWhereClause(filters, req.user);

    const query = `
      WITH base_filtrada AS (
        SELECT * FROM dados_matriculas WHERE ${clause}
      ),
      base_sem_especiais AS (
        SELECT * FROM base_filtrada WHERE idetapa_matricula NOT IN (98,99)
      ),
      escolas_metricas AS (
        SELECT 
          idescola,
          MAX(escola) as escola,
          COUNT(*) as total_matriculas,
          COUNT(*) FILTER (WHERE saida_mes_situacao IS NOT NULL AND saida_mes_situacao != '-') as saidas,
          COALESCE(SUM(limite_maximo_aluno), 0) as capacidade
        FROM base_sem_especiais
        GROUP BY idescola
      )
      SELECT 
        COALESCE(json_agg(
          json_build_object(
            'idescola', idescola,
            'escola', escola,
            'totalMatriculas', total_matriculas,
            'capacidade', capacidade,
            'saidas', saidas,
            'taxaEvasao', 
              CASE 
                WHEN total_matriculas > 0 
                THEN ROUND(saidas * 100.0 / total_matriculas, 2)
                ELSE 0
              END,
            'taxaOcupacao', 
              CASE 
                WHEN capacidade > 0 
                THEN ROUND(total_matriculas * 100.0 / capacidade, 2)
                ELSE 0
              END,
            'alertas', CASE 
              WHEN saidas * 100.0 / NULLIF(total_matriculas, 0) > 10 THEN 'EVASAO_ALTA'
              WHEN total_matriculas * 100.0 / NULLIF(capacidade, 0) > 90 THEN 'CAPACIDADE_MAXIMA'
              WHEN total_matriculas * 100.0 / NULLIF(capacidade, 0) < 50 THEN 'BAIXA_OCUPACAO'
              ELSE 'NORMAL'
            END
          )
          ORDER BY 
            CASE 
              WHEN saidas * 100.0 / NULLIF(total_matriculas, 0) > 10 THEN 1
              WHEN total_matriculas * 100.0 / NULLIF(capacidade, 0) > 90 THEN 2
              WHEN total_matriculas * 100.0 / NULLIF(capacidade, 0) < 50 THEN 3
              ELSE 4
            END
        ), '[]'::json) as alertas_escolas
      FROM escolas_metricas
      WHERE 
        saidas * 100.0 / NULLIF(total_matriculas, 0) > 10 OR
        total_matriculas * 100.0 / NULLIF(capacidade, 0) > 90 OR
        total_matriculas * 100.0 / NULLIF(capacidade, 0) < 50
    `;

    const result = await pool.query(query, params);
    const row = result.rows[0];

    const responseData = {
      alertas: row.alertas_escolas || [],
      totalAlertas: row.alertas_escolas ? row.alertas_escolas.length : 0,
      alertasPorTipo: {
        evasaoAlta: row.alertas_escolas ? row.alertas_escolas.filter(a => a.alertas === 'EVASAO_ALTA').length : 0,
        capacidadeMaxima: row.alertas_escolas ? row.alertas_escolas.filter(a => a.alertas === 'CAPACIDADE_MAXIMA').length : 0,
        baixaOcupacao: row.alertas_escolas ? row.alertas_escolas.filter(a => a.alertas === 'BAIXA_OCUPACAO').length : 0
      }
    };

    cache.set(cacheKey, responseData);
    
    console.log('Alertas retornados:', {
      totalAlertas: responseData.totalAlertas,
      porTipo: responseData.alertasPorTipo
    });
    
    res.json(responseData);
  } catch (err) {
    console.error("Erro ao buscar alertas:", err);
    res.status(500).json({ 
      error: "Erro ao buscar alertas", 
      details: err.message 
    });
  }
};

module.exports = {
  buscarAnalytics,
  buscarAlertas
};