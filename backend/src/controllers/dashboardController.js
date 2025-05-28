const pool = require('../config/db');
const NodeCache = require('node-cache');

// Configuração do cache
const cache = new NodeCache({ 
  stdTTL: 300, // 5 minutos de TTL padrão
  checkperiod: 60 // Verificar expiração a cada 60 segundos
});

// Nome da coluna que referencia o cliente na tabela dados_matriculas
const clientField = 'idcliente';

const buildWhereClause = (filters, user) => {
  const whereClauses = ["1=1"];
  const params = [];
  const addFilter = (value, field) => {
    if (value !== undefined && value !== null && value !== "") {
      params.push(value);
      whereClauses.push(`${field} = $${params.length}`);
    }
  };

  // Aplica os filtros gerais (exceto o filtro de idcliente manual)
  addFilter(filters.anoLetivo, "ano_letivo");
  addFilter(filters.deficiencia, "deficiencia");
  addFilter(filters.grupoEtapa, "grupo_etapa");
  addFilter(filters.etapaMatricula, "etapa_matricula");
  addFilter(filters.etapaTurma, "etapa_turma");
  addFilter(filters.multisserie, "multisserie");
  addFilter(filters.situacaoMatricula, "situacao_matricula");
  addFilter(filters.tipoMatricula, "tipo_matricula");
  addFilter(filters.tipoTransporte, "tipo_transporte");
  addFilter(filters.transporteEscolar, "transporte_escolar");
  addFilter(filters.idescola, "idescola");

  // Lógica de filtro por cliente: prioriza dados do token
  let clientFilterApplied = false;
  if (user) {
    // Se existir user.clientId (usuário vinculado a UM cliente)
    if (user.clientId !== undefined && user.clientId !== null && user.clientId !== "") {
      addFilter(user.clientId, clientField);
      clientFilterApplied = true;
    }
    // Se não existir, mas o token tiver allowedClients (usuário com múltiplos clientes)
    else if (user.allowedClients && user.allowedClients.length > 0) {
      params.push(user.allowedClients);
      whereClauses.push(`${clientField} = ANY($${params.length}::integer[])`);
      clientFilterApplied = true;
    }
  }

  // Se nenhum filtro de cliente foi aplicado pelo token, usa o filtro manual enviado no body
  if (!clientFilterApplied) {
    addFilter(filters.idcliente, clientField);
  }

  return { clause: whereClauses.join(" AND "), params };
};

// Função auxiliar para gerar chave de cache baseada nos filtros
const generateCacheKey = (prefix, filters, user) => {
  const userKey = user ? 
    (user.clientId || (user.allowedClients ? user.allowedClients.join(',') : '')) : '';
  
  return `${prefix}_${userKey}_${Object.entries(filters)
    .filter(([_, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}:${value}`)
    .sort()
    .join('_')}`;
};

const buscarTotais = async (req, res) => {
  try {
    // Extrai os filtros do body
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

    // Gera chave de cache baseada nos filtros
    const cacheKey = generateCacheKey('totais', filters, req.user);
    
    // Verifica se os dados já estão em cache
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    // Se não estiver em cache, busca do banco de dados
    const { clause, params } = buildWhereClause(filters, req.user);

    // Consulta otimizada usando CTE (Common Table Expressions)
    const query = `
      WITH base_filtrada AS (
        SELECT * FROM dados_matriculas WHERE ${clause}
      ),
      base_sem_especiais AS (
        SELECT * FROM base_filtrada WHERE idetapa_matricula NOT IN (98,99)
      ),
      totais AS (
        SELECT 
          COUNT(*) AS total_matriculas,
          COUNT(DISTINCT idescola) AS total_escolas,
          COUNT(*) FILTER (WHERE entrada_mes_tipo IS NOT NULL AND entrada_mes_tipo != '-') AS total_entradas,
          COUNT(*) FILTER (WHERE saida_mes_situacao IS NOT NULL AND saida_mes_situacao != '-') AS total_saidas
        FROM base_sem_especiais
      ),
      turmas AS (
        SELECT DISTINCT escola, idescola, idturma, limite_maximo_aluno
        FROM base_sem_especiais
      ),
      total_matriculas_por_escola AS (
        SELECT 
          idescola, 
          COUNT(*) FILTER (WHERE situacao_matricula = 'ATIVO' AND idetapa_matricula NOT IN (98,99)) AS qtde_matriculas
        FROM base_sem_especiais
        GROUP BY idescola
      ),
      escolas_detalhes AS (
        SELECT 
          t.escola,
          t.idescola,
          COUNT(t.idturma) AS qtde_turmas,
          COALESCE(tm.qtde_matriculas, 0) AS qtde_matriculas,
          SUM(t.limite_maximo_aluno) AS limite_maximo_aluno,
          SUM(t.limite_maximo_aluno) - COALESCE(tm.qtde_matriculas, 0) AS vagas_disponiveis
        FROM turmas t
        LEFT JOIN total_matriculas_por_escola tm ON t.idescola = tm.idescola
        GROUP BY t.escola, t.idescola, tm.qtde_matriculas
      ),
      total_vagas AS (
        SELECT SUM(vagas_disponiveis) AS total_vagas FROM escolas_detalhes
      ),
      entradas_saidas_mes AS (
        SELECT 
          COALESCE(e.mes, s.mes) AS mes,
          COALESCE(e.total_entradas, 0) AS entradas,
          COALESCE(s.total_saidas, 0) AS saidas
        FROM (
          SELECT 
            SUBSTRING(entrada_mes_tipo, 1, 2)::INT AS mes,
            COUNT(*) AS total_entradas
          FROM base_filtrada
          WHERE entrada_mes_tipo IS NOT NULL AND entrada_mes_tipo != '-'
          GROUP BY mes
        ) e
        FULL JOIN (
          SELECT 
            SUBSTRING(saida_mes_situacao, 1, 2)::INT AS mes,
            COUNT(*) AS total_saidas
          FROM base_filtrada
          WHERE saida_mes_situacao IS NOT NULL AND saida_mes_situacao != '-'
          GROUP BY mes
        ) s ON e.mes = s.mes
      ),
      matriculas_por_zona AS (
        SELECT zona_aluno, COUNT(*) as total 
        FROM base_sem_especiais
        GROUP BY zona_aluno
      ),
      matriculas_por_sexo AS (
        SELECT sexo, COUNT(*) as total 
        FROM base_sem_especiais
        GROUP BY sexo
      ),
      matriculas_por_turno AS (
        SELECT turno, COUNT(*) as total 
        FROM base_sem_especiais
        GROUP BY turno, cdturno 
        ORDER BY cdturno
      ),
      escolas_por_zona AS (
        SELECT zona_escola, COUNT(DISTINCT idescola) as total 
        FROM base_filtrada
        GROUP BY zona_escola
      ),
      ultima_atualizacao AS (
        SELECT (MAX(ultima_atualizacao) AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') AS ultima_atualizacao 
        FROM dados_matriculas
      )
      SELECT 
        (SELECT total_matriculas FROM totais) AS total_matriculas,
        (SELECT total_escolas FROM totais) AS total_escolas,
        (SELECT total_vagas FROM total_vagas) AS total_vagas,
        (SELECT total_entradas FROM totais) AS total_entradas,
        (SELECT total_saidas FROM totais) AS total_saidas,
        (SELECT ultima_atualizacao FROM ultima_atualizacao) AS ultima_atualizacao,
        (SELECT json_agg(escolas_detalhes.*) FROM escolas_detalhes ORDER BY qtde_matriculas DESC) AS escolas,
        (SELECT json_object_agg(mes, json_build_object('entradas', entradas, 'saidas', saidas)) 
         FROM entradas_saidas_mes) AS entradas_saidas_por_mes,
        (SELECT json_object_agg(zona_aluno, total) FROM matriculas_por_zona) AS matriculas_por_zona,
        (SELECT json_object_agg(sexo, total) FROM matriculas_por_sexo) AS matriculas_por_sexo,
        (SELECT json_object_agg(turno, total) FROM matriculas_por_turno) AS matriculas_por_turno,
        (SELECT json_object_agg(zona_escola, total) FROM escolas_por_zona) AS escolas_por_zona
    `;

    const result = await pool.query(query, params);
    
    // Processamento dos dados retornados
    const row = result.rows[0];
    
    // Preparação dos dados para o formato esperado pelo frontend
    const nomesMeses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const entradasSaidasPorMes = {};
    
    if (row.entradas_saidas_por_mes) {
      Object.entries(row.entradas_saidas_por_mes).forEach(([mes, dados]) => {
        const mesIndex = parseInt(mes) - 1;
        const mesAbreviado = nomesMeses[mesIndex] || mes;
        entradasSaidasPorMes[mesAbreviado] = {
          entradas: parseInt(dados.entradas, 10) || 0,
          saidas: parseInt(dados.saidas, 10) || 0
        };
      });
    }
    
    // Cálculo da tendência de matrículas (comparativo com ano anterior)
    // Ajustado para aplicar todos os filtros exceto o ano letivo
    let trendMatriculas = null;
    if (filters.anoLetivo) {
      const prevYear = (parseInt(filters.anoLetivo, 10) - 1).toString();
      
      // Cria uma cópia dos filtros atuais para o ano anterior, mantendo todos os outros filtros
      const prevYearFilters = { ...filters, anoLetivo: prevYear };
      
      const { clause: clausePrev, params: paramsPrev } = buildWhereClause(prevYearFilters, req.user);
      
      const prevQuery = `SELECT COUNT(*) FROM dados_matriculas WHERE ${clausePrev} AND idetapa_matricula NOT IN (98,99)`;
      const prevResult = await pool.query(prevQuery, paramsPrev);
      
      const prevMat = parseInt(prevResult.rows[0].count, 10) || 0;
      const currentMat = parseInt(row.total_matriculas, 10) || 0;
      
      if (prevMat > 0) {
        const diff = prevMat - currentMat;
        const percentMissing = (Math.abs(diff) / prevMat) * 100;
        trendMatriculas = {
          missing: diff,
          percent: parseFloat(percentMissing.toFixed(2)),
          arrow: diff > 0 ? "down" : diff < 0 ? "up" : ""
        };
      }
    }
    
    // Formatação das escolas com status de vagas
    const escolas = row.escolas ? row.escolas.map(escola => ({
      ...escola,
      status_vagas: escola.vagas_disponiveis >= 0 ? "disponivel" : "excedido"
    })) : [];
    
    // Montagem do objeto de resposta final
    const responseData = {
      totalMatriculas: parseInt(row.total_matriculas, 10) || 0,
      totalEscolas: parseInt(row.total_escolas, 10) || 0,
      totalVagas: parseInt(row.total_vagas, 10) || 0,
      totalEntradas: parseInt(row.total_entradas, 10) || 0,
      totalSaidas: parseInt(row.total_saidas, 10) || 0,
      escolas,
      entradasSaidasPorMes,
      comparativos: { totalMatriculas: trendMatriculas },
      matriculasPorZona: row.matriculas_por_zona || {},
      matriculasPorSexo: row.matriculas_por_sexo || {},
      matriculasPorTurno: row.matriculas_por_turno || {},
      escolasPorZona: row.escolas_por_zona || {},
      ultimaAtualizacao: row.ultima_atualizacao,
      tendenciaMatriculas: trendMatriculas
    };
    
    // Armazena os dados em cache
    cache.set(cacheKey, responseData);
    
    res.json(responseData);
  } catch (err) {
    console.error("Erro ao buscar totais:", err);
    res.status(500).json({ error: "Erro ao buscar dados da dashboard", details: err.message });
  }
};

const buscarFiltros = async (req, res) => {
  try {
    // Gera chave de cache para os filtros
    const cacheKey = generateCacheKey('filtros', {}, req.user);
    
    // Verifica se os filtros já estão em cache
    const cachedFilters = cache.get(cacheKey);
    if (cachedFilters) {
      return res.json(cachedFilters);
    }
    
    // Constrói a cláusula WHERE considerando os filtros e o usuário
    const { clause, params } = buildWhereClause({}, req.user);

    // Consulta otimizada para buscar todos os filtros em uma única query
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
        (SELECT array_agg(DISTINCT situacao_matricula) FROM base_filtrada WHERE situacao_matricula IS NOT NULL) AS situacao_matricula,
        (SELECT array_agg(DISTINCT tipo_matricula) FROM base_filtrada WHERE tipo_matricula IS NOT NULL) AS tipo_matricula,
        (SELECT array_agg(DISTINCT tipo_transporte) FROM base_filtrada WHERE tipo_transporte IS NOT NULL) AS tipo_transporte,
        (SELECT array_agg(DISTINCT transporte_escolar) FROM base_filtrada WHERE transporte_escolar IS NOT NULL) AS transporte_escolar,
        (SELECT json_object_agg(
          grupo_etapa, 
          (SELECT array_agg(DISTINCT etapa_matricula) FROM base_filtrada bf2 WHERE bf2.grupo_etapa = bf1.grupo_etapa)
        ) FROM (SELECT DISTINCT grupo_etapa FROM base_filtrada) bf1) AS etapas_matricula_por_grupo,
        (SELECT json_object_agg(
          grupo_etapa, 
          (SELECT array_agg(DISTINCT etapa_turma) FROM base_filtrada bf2 WHERE bf2.grupo_etapa = bf1.grupo_etapa)
        ) FROM (SELECT DISTINCT grupo_etapa FROM base_filtrada) bf1) AS etapas_turma_por_grupo
    `;
    
    const result = await pool.query(query, params);
    const row = result.rows[0];
    
    // Formatação da resposta
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
      transporte_escolar: row.transporte_escolar || [],
      etapasMatriculaPorGrupo: row.etapas_matricula_por_grupo || {},
      etapasTurmaPorGrupo: row.etapas_turma_por_grupo || {}
    };
    
    // Armazena os filtros em cache com TTL maior (1 hora)
    cache.set(cacheKey, response, 3600);
    
    res.json(response);
  } catch (err) {
    console.error("Erro ao buscar filtros:", err);
    res.status(500).json({ error: "Erro ao buscar filtros", details: err.message });
  }
};

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
    
    // Gera chave de cache para os breakdowns
    const cacheKey = generateCacheKey('breakdowns', filters, req.user);
    
    // Verifica se os dados já estão em cache
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const { clause, params } = buildWhereClause(filters, req.user);
    
    // Consulta otimizada para buscar todos os breakdowns em uma única query
    const query = `
      WITH base_filtrada AS (
        SELECT * FROM dados_matriculas WHERE ${clause}
      ),
      base_sem_especiais AS (
        SELECT * FROM base_filtrada WHERE idetapa_matricula NOT IN (98,99)
      ),
      matriculas_por_zona AS (
        SELECT zona_aluno, COUNT(*) as total 
        FROM base_sem_especiais
        GROUP BY zona_aluno
      ),
      matriculas_por_sexo AS (
        SELECT sexo, COUNT(*) as total 
        FROM base_sem_especiais
        GROUP BY sexo
      ),
      matriculas_por_turno AS (
        SELECT turno, COUNT(*) as total 
        FROM base_sem_especiais
        GROUP BY turno, cdturno 
        ORDER BY cdturno
      )
      SELECT 
        (SELECT json_object_agg(zona_aluno, total) FROM matriculas_por_zona) AS matriculas_por_zona,
        (SELECT json_object_agg(sexo, total) FROM matriculas_por_sexo) AS matriculas_por_sexo,
        (SELECT json_object_agg(turno, total) FROM matriculas_por_turno) AS matriculas_por_turno
    `;
    
    const result = await pool.query(query, params);
    const row = result.rows[0];
    
    // Formatação da resposta
    const response = {
      matriculasPorZona: row.matriculas_por_zona || {},
      matriculasPorSexo: row.matriculas_por_sexo || {},
      matriculasPorTurno: row.matriculas_por_turno || {}
    };
    
    // Armazena os dados em cache
    cache.set(cacheKey, response);
    
    res.json(response);
  } catch (err) {
    console.error("Erro ao buscar breakdowns:", err);
    res.status(500).json({ error: "Erro ao buscar breakdowns", details: err.message });
  }
};

// Função para limpar o cache (útil para atualizações de dados)
const limparCache = (req, res) => {
  try {
    const resultado = cache.flushAll();
    res.json({ success: resultado, message: "Cache limpo com sucesso" });
  } catch (err) {
    console.error("Erro ao limpar cache:", err);
    res.status(500).json({ error: "Erro ao limpar cache", details: err.message });
  }
};

module.exports = {
  buscarTotais,
  buscarFiltros,
  buscarBreakdowns,
  limparCache
};
