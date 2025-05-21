const pool = require('../config/db');

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

  console.log("Cláusula WHERE:", whereClauses.join(" AND "));
  console.log("Parâmetros:", params);
  return { clause: whereClauses.join(" AND "), params };
};

const buscarTotais = async (req, res) => {
  try {
    console.log("req.user:", req.user);

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
      idcliente: req.body.idcliente, // Será ignorado se o token tiver filtro de cliente
      idescola: req.body.idescola // filtro da escola
    };

    const { clause, params } = buildWhereClause(filters, req.user);
    const queryBase = `FROM dados_matriculas WHERE ${clause} `;
    const queryBaseFiltrada = queryBase + "AND idetapa_matricula NOT IN (98,99) ";

    const queriesMain = {
      totalMatriculas: `SELECT COUNT(*) ${queryBaseFiltrada}`,
      totalEscolas: `SELECT COUNT(DISTINCT idescola) ${queryBase}`,
      totalVagas: `
        SELECT 
    SUM(limite_maximo_aluno) - SUM(qtde_matriculas) AS total_vagas
  FROM (
    WITH turmas AS (
      SELECT DISTINCT escola, idescola, idturma, limite_maximo_aluno
      ${queryBaseFiltrada}
    ),
    totalMatriculas AS (
      SELECT idescola, COUNT(*) FILTER (
        WHERE situacao_matricula = 'ATIVO' AND idetapa_matricula NOT IN (98,99)
      ) AS qtde_matriculas
      ${queryBaseFiltrada}
      GROUP BY idescola
    )
    SELECT 
      t.idescola,
      SUM(t.limite_maximo_aluno) AS limite_maximo_aluno,
      COALESCE(tm.qtde_matriculas, 0) AS qtde_matriculas
    FROM turmas t
    LEFT JOIN totalMatriculas tm ON t.idescola = tm.idescola
    GROUP BY t.idescola, tm.qtde_matriculas
  ) AS sub
      `,
      totalEntradas: `SELECT COUNT(*) ${queryBase}AND entrada_mes_tipo IS NOT NULL AND entrada_mes_tipo != '-'`,
      totalSaidas: `SELECT COUNT(*) ${queryBase}AND saida_mes_situacao IS NOT NULL AND saida_mes_situacao != '-'`
    };

    const resultsMain = await Promise.all(
      Object.values(queriesMain).map(q => pool.query(q, params))
    );

    const ultimaAtualizacaoQuery = `
      SELECT (MAX(ultima_atualizacao) AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') 
      AS ultima_atualizacao 
      FROM dados_matriculas
    `;
    const ultimaAtualizacaoResult = await pool.query(ultimaAtualizacaoQuery);
    const ultimaAtualizacao = ultimaAtualizacaoResult.rows[0].ultima_atualizacao;

    // Breakdown para registros com grupo_etapa "complementar"
    let matriculasPorZona = {};
    let matriculasPorSexo = {};
    let matriculasPorTurno = {};

    if (filters.grupoEtapa && filters.grupoEtapa.toLowerCase() === "complementar") {
      try {
        const matriculasZonaQuery = `SELECT zona_aluno, COUNT(*) as total ${queryBaseFiltrada}GROUP BY zona_aluno `;
        const resultZona = await pool.query(matriculasZonaQuery, params);
        resultZona.rows.forEach(row => {
          matriculasPorZona[row.zona_aluno] = parseInt(row.total, 10);
        });
      } catch (err) {
        console.error("Erro ao buscar matriculas por zona:", err);
      }
      try {
        const matriculasSexoQuery = `SELECT sexo, COUNT(*) as total ${queryBaseFiltrada}GROUP BY sexo `;
        const resultSexo = await pool.query(matriculasSexoQuery, params);
        resultSexo.rows.forEach(row => {
          matriculasPorSexo[row.sexo] = parseInt(row.total, 10);
        });
      } catch (err) {
        console.error("Erro ao buscar matriculas por sexo:", err);
      }
      try {
        const matriculasTurnoQuery = `SELECT turno, COUNT(*) as total ${queryBaseFiltrada}GROUP BY turno `;
        const resultTurno = await pool.query(matriculasTurnoQuery, params);
        resultTurno.rows.forEach(row => {
          matriculasPorTurno[row.turno] = parseInt(row.total, 10);
        });
      } catch (err) {
        console.error("Erro ao buscar matriculas por turno:", err);
      }
    }

    const escolasQuery = `
      WITH turmas AS (
        SELECT DISTINCT escola, idescola, idturma, limite_maximo_aluno
        ${queryBaseFiltrada}
      ),
      totalMatriculas AS (
        SELECT idescola, COUNT(*) FILTER (
          WHERE situacao_matricula = 'ATIVO' AND idetapa_matricula NOT IN (98,99)
        ) AS qtde_matriculas
        ${queryBaseFiltrada}
        GROUP BY idescola
      )
      SELECT 
        t.escola,
        t.idescola,
        COUNT(t.idturma) AS qtde_turmas,
        COALESCE(tm.qtde_matriculas, 0) AS qtde_matriculas,
        SUM(t.limite_maximo_aluno) AS limite_maximo_aluno,
        SUM(t.limite_maximo_aluno) - COALESCE(tm.qtde_matriculas, 0) AS vagas_disponiveis
      FROM turmas t
      LEFT JOIN totalMatriculas tm ON t.idescola = tm.idescola
      GROUP BY t.escola, t.idescola, tm.qtde_matriculas
      ORDER BY qtde_matriculas DESC
    `;
    const escolasResult = await pool.query(escolasQuery, params);
    const escolas = escolasResult.rows.map(row => ({
      escola: row.escola,
      idescola: row.idescola,
      qtde_turmas: row.qtde_turmas,
      qtde_matriculas: row.qtde_matriculas,
      limite_maximo_aluno: row.limite_maximo_aluno,
      vagas_disponiveis: row.vagas_disponiveis,
      status_vagas: row.vagas_disponiveis >= 0 ? "disponivel" : "excedido"
    }));

    const entradasSaidasQuery = `
      WITH entradas AS (
        SELECT 
          SUBSTRING(entrada_mes_tipo, 1, 2)::INT AS mes,
          COUNT(*) AS total_entradas
        ${queryBase} AND entrada_mes_tipo IS NOT NULL AND entrada_mes_tipo != '-'
        GROUP BY mes
      ),
      saidas AS (
        SELECT 
          SUBSTRING(saida_mes_situacao, 1, 2)::INT AS mes,
          COUNT(*) AS total_saidas
        ${queryBase} AND saida_mes_situacao IS NOT NULL AND saida_mes_situacao != '-'
        GROUP BY mes
      )
      SELECT
        COALESCE(e.mes, s.mes) AS mes,
        COALESCE(e.total_entradas, 0) AS entradas,
        COALESCE(s.total_saidas, 0) AS saidas
      FROM entradas e
      FULL JOIN saidas s ON e.mes = s.mes
      ORDER BY COALESCE(e.mes, s.mes)
    `;
    const entradasSaidasResult = await pool.query(entradasSaidasQuery, params);
    const entradasSaidasPorMes = {};
    const nomesMeses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    entradasSaidasResult.rows.forEach(row => {
      const mesIndex = row.mes - 1; 
      const mesAbreviado = nomesMeses[mesIndex] || row.mes;
      const entradas = parseInt(row.entradas, 10) || 0;
      const saidas = parseInt(row.saidas, 10) || 0;
      entradasSaidasPorMes[mesAbreviado] = { entradas, saidas };
    });

    const escolasZonaQuery = `SELECT zona_escola, COUNT(DISTINCT idescola) as total ${queryBase}GROUP BY zona_escola `;
    const resultEscolasZona = await pool.query(escolasZonaQuery, params);
    const escolasPorZona = {};
    resultEscolasZona.rows.forEach(row => {
      escolasPorZona[row.zona_escola] = parseInt(row.total, 10);
    });

    let trendMatriculas = null;
    if (filters.anoLetivo) {
      const prevYear = (parseInt(filters.anoLetivo, 10) - 1).toString();
      const { clause: clausePrev, params: paramsPrev } = buildWhereClause({
        anoLetivo: prevYear,
        deficiencia: filters.deficiencia,
        grupoEtapa: filters.grupoEtapa,
        etapaMatricula: filters.etapaMatricula,
        etapaTurma: filters.etapaTurma,
        multisserie: filters.multisserie,
        situacaoMatricula: filters.situacaoMatricula,
        tipoMatricula: filters.tipoMatricula,
        tipoTransporte: filters.tipoTransporte,
        transporteEscolar: filters.transporteEscolar,
        idcliente: filters.idcliente
      }, req.user);
      const queryBasePrev = `FROM dados_matriculas WHERE ${clausePrev} `;
      const queriesPrev = {
        totalMatriculas: `SELECT COUNT(*) ${queryBasePrev}AND idetapa_matricula NOT IN (98,99)`
      };
      const resultsPrev = await Promise.all(
        Object.values(queriesPrev).map(q => pool.query(q, paramsPrev))
      );
      const prevMat = parseInt(resultsPrev[0].rows[0].count, 10) || 0;
      const currentMat = parseInt(resultsMain[0].rows[0].count, 10) || 0;
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

    res.json({
      totalMatriculas: parseInt(resultsMain[0].rows[0].count, 10) || 0,
      totalEscolas: parseInt(resultsMain[1].rows[0].count, 10) || 0,
      totalVagas: parseInt(resultsMain[2].rows[0].total_vagas, 10) || 0,
      totalEntradas: parseInt(resultsMain[3].rows[0].count, 10) || 0,
      totalSaidas: parseInt(resultsMain[4].rows[0].count, 10) || 0,
      escolas,
      entradasSaidasPorMes,
      comparativos: { totalMatriculas: trendMatriculas },
      matriculasPorZona,
      matriculasPorSexo,
      matriculasPorTurno,
      escolasPorZona,
      ultimaAtualizacao,
      tendenciaMatriculas: trendMatriculas
    });
  } catch (err) {
    console.error("Erro ao buscar totais:", err);
    res.status(500).json({ error: "Erro ao buscar dados da dashboard", details: err.message });
  }
};

const buscarFiltros = async (req, res) => {
  try {
    // Recebe os filtros enviados no body, se houver, ou usa objeto vazio
    const filters = req.body || {};

    // Constrói a cláusula WHERE considerando os filtros e o usuário
    const { clause, params } = buildWhereClause(filters, req.user);

    // Consulta os filtros aplicando a cláusula WHERE
    const filtrosResult = await pool.query(`
      SELECT DISTINCT 
        ano_letivo, deficiencia, grupo_etapa, etapa_matricula,
        etapa_turma, multisserie, situacao_matricula, tipo_matricula,
        tipo_transporte, transporte_escolar
      FROM dados_matriculas
      WHERE ${clause}
      ORDER BY ano_letivo DESC
    `, params);

    const formatarFiltro = (key) =>
      [...new Set(filtrosResult.rows.map(row => row[key]).filter(Boolean))];

    const etapasMatriculaResult = await pool.query(`
      SELECT grupo_etapa, array_agg(DISTINCT etapa_matricula) as etapas
      FROM dados_matriculas
      WHERE ${clause}
      GROUP BY grupo_etapa
    `, params);
    const etapasMatriculaPorGrupo = {};
    etapasMatriculaResult.rows.forEach(row => {
      etapasMatriculaPorGrupo[row.grupo_etapa] = row.etapas || [];
    });

    const etapasTurmaResult = await pool.query(`
      SELECT grupo_etapa, array_agg(DISTINCT etapa_turma) as etapas
      FROM dados_matriculas
      WHERE ${clause}
      GROUP BY grupo_etapa
    `, params);
    const etapasTurmaPorGrupo = {};
    etapasTurmaResult.rows.forEach(row => {
      etapasTurmaPorGrupo[row.grupo_etapa] = row.etapas || [];
    });

    res.json({
      ano_letivo: formatarFiltro('ano_letivo'),
      deficiencia: formatarFiltro('deficiencia'),
      grupo_etapa: formatarFiltro('grupo_etapa'),
      etapa_matricula: formatarFiltro('etapa_matricula'),
      etapa_turma: formatarFiltro('etapa_turma'),
      multisserie: formatarFiltro('multisserie'),
      situacao_matricula: formatarFiltro('situacao_matricula'),
      tipo_matricula: formatarFiltro('tipo_matricula'),
      tipo_transporte: formatarFiltro('tipo_transporte'),
      transporte_escolar: formatarFiltro('transporte_escolar'),
      etapasMatriculaPorGrupo,
      etapasTurmaPorGrupo
    });
  } catch (err) {
    console.error("Erro ao buscar filtros:", err);
    res.status(500).json({ error: "Erro ao buscar filtros", details: err.message });
  }
};

const buscarBreakdowns = async (req, res) => {
  try {
    const {
      anoLetivo,
      deficiencia,
      grupoEtapa,
      etapaMatricula,
      etapaTurma,
      multisserie,
      situacaoMatricula,
      tipoMatricula,
      tipoTransporte,
      transporteEscolar,
      idcliente
    } = req.body;

    const { clause, params } = buildWhereClause({
      anoLetivo,
      deficiencia,
      grupoEtapa,
      etapaMatricula,
      etapaTurma,
      multisserie,
      situacaoMatricula,
      tipoMatricula,
      tipoTransporte,
      transporteEscolar,
      idcliente
    }, req.user);

    const queryBase = `FROM dados_matriculas WHERE ${clause} `;
    const queryBaseFiltrada = queryBase + "AND idetapa_matricula NOT IN (98,99) ";

    let matriculasPorZona = {};
    let matriculasPorSexo = {};
    let matriculasPorTurno = {};

    try {
      const matriculasZonaQuery = `SELECT zona_aluno, COUNT(*) as total ${queryBaseFiltrada}GROUP BY zona_aluno `;
      const resultZona = await pool.query(matriculasZonaQuery, params);
      resultZona.rows.forEach(row => {
        matriculasPorZona[row.zona_aluno] = parseInt(row.total, 10);
      });
    } catch (err) {
      console.error("Erro ao buscar matriculas por zona:", err);
    }
    try {
      const matriculasSexoQuery = `SELECT sexo, COUNT(*) as total ${queryBaseFiltrada}GROUP BY sexo `;
      const resultSexo = await pool.query(matriculasSexoQuery, params);
      resultSexo.rows.forEach(row => {
        matriculasPorSexo[row.sexo] = parseInt(row.total, 10);
      });
    } catch (err) {
      console.error("Erro ao buscar matriculas por sexo:", err);
    }
    try {
      const matriculasTurnoQuery = `SELECT turno, COUNT(*) as total ${queryBaseFiltrada}GROUP BY turno, cdturno ORDER BY cdturno `;
      const resultTurno = await pool.query(matriculasTurnoQuery, params);
      resultTurno.rows.forEach(row => {
        matriculasPorTurno[row.turno] = parseInt(row.total, 10);
      });
    } catch (err) {
      console.error("Erro ao buscar matriculas por turno:", err);
    }

    res.json({
      matriculasPorZona,
      matriculasPorSexo,
      matriculasPorTurno
    });
  } catch (err) {
    console.error("Erro ao buscar breakdowns:", err);
    res.status(500).json({ error: "Erro ao buscar breakdowns", details: err.message });
  }
};

module.exports = { buscarTotais, buscarFiltros, buscarBreakdowns };
