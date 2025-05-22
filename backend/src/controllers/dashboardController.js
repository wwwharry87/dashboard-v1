const pool = require('../config/db');

// Nome da coluna que referencia o cliente na tabela dados_matriculas
const clientField = 'idcliente';

// Função para montar o WHERE com todos os filtros, inclusive idescola
const buildWhereClause = (filters, user) => {
  const whereClauses = ["1=1"];
  const params = [];
  const addFilter = (value, field) => {
    if (value !== undefined && value !== null && value !== "") {
      params.push(value);
      whereClauses.push(`${field} = $${params.length}`);
    }
  };

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
  addFilter(filters.idescola, "idescola"); // <-- ESSA LINHA É O SEGREDO!

  // Lógica de filtro por cliente
  let clientFilterApplied = false;
  if (user) {
    if (user.clientId !== undefined && user.clientId !== null && user.clientId !== "") {
      addFilter(user.clientId, clientField);
      clientFilterApplied = true;
    } else if (user.allowedClients && user.allowedClients.length > 0) {
      params.push(user.allowedClients);
      whereClauses.push(`${clientField} = ANY($${params.length}::integer[])`);
      clientFilterApplied = true;
    }
  }
  if (!clientFilterApplied) {
    addFilter(filters.idcliente, clientField);
  }
  return { clause: whereClauses.join(" AND "), params };
};

// === FUNÇÃO PRINCIPAL DOS TOTAIS (INCLUINDO SEXO, TURNO, ZONA e COMPARATIVO) ===
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
      idescola: req.body.idescola // <--- ESSENCIAL!
    };

    const { clause, params } = buildWhereClause(filters, req.user);
    const queryBase = `FROM dados_matriculas WHERE ${clause} `;
    const queryBaseFiltrada = queryBase + "AND idetapa_matricula NOT IN (98,99) ";

    // 1. Cartões principais
    const queriesMain = {
      totalMatriculas: `SELECT COUNT(*) ${queryBaseFiltrada}`,
      totalEscolas: `SELECT COUNT(DISTINCT idescola) ${queryBase}`,
      totalVagas: `
  SELECT 
    SUM(
      CASE 
        WHEN (limite_maximo_aluno - COALESCE(qtde_matriculas, 0)) > 0
        THEN (limite_maximo_aluno - COALESCE(qtde_matriculas, 0))
        ELSE 0
      END
    ) AS total_vagas
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

    // 2. Matrículas por Zona
    const matriculasZonaQuery = `SELECT zona_aluno, COUNT(*) as total ${queryBaseFiltrada}GROUP BY zona_aluno `;
    const resultZona = await pool.query(matriculasZonaQuery, params);
    const matriculasPorZona = {};
    resultZona.rows.forEach(row => {
      matriculasPorZona[row.zona_aluno] = parseInt(row.total, 10);
    });

    // 3. Matrículas por Sexo
    const matriculasSexoQuery = `SELECT sexo, COUNT(*) as total ${queryBaseFiltrada}GROUP BY sexo `;
    const resultSexo = await pool.query(matriculasSexoQuery, params);
    const matriculasPorSexo = {};
    resultSexo.rows.forEach(row => {
      matriculasPorSexo[row.sexo] = parseInt(row.total, 10);
    });

    // 4. Matrículas por Turno
    const matriculasTurnoQuery = `SELECT turno, COUNT(*) as total ${queryBaseFiltrada}GROUP BY turno, cdturno ORDER BY cdturno `;
    const resultTurno = await pool.query(matriculasTurnoQuery, params);
    const matriculasPorTurno = {};
    resultTurno.rows.forEach(row => {
      matriculasPorTurno[row.turno] = parseInt(row.total, 10);
    });

    // 5. Lista de escolas (para tabela)
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

    // 6. Gráfico de movimentação mensal
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

    // 7. Escolas por Zona (cartão extra)
    const escolasZonaQuery = `SELECT zona_escola, COUNT(DISTINCT idescola) as total ${queryBase}GROUP BY zona_escola `;
    const resultEscolasZona = await pool.query(escolasZonaQuery, params);
    const escolasPorZona = {};
    resultEscolasZona.rows.forEach(row => {
      escolasPorZona[row.zona_escola] = parseInt(row.total, 10);
    });

    // 8. Tendência/Comparativo de matrículas (cartão com filtro aplicado)
    let trendMatriculas = null;
    if (filters.anoLetivo) {
      const prevYear = (parseInt(filters.anoLetivo, 10) - 1).toString();
      const { clause: clausePrev, params: paramsPrev } = buildWhereClause({
        ...filters,
        anoLetivo: prevYear // Só troca o ano, mantém idescola e todos os filtros!
      }, req.user);

      const queryBasePrev = `FROM dados_matriculas WHERE ${clausePrev} `;
      const resultPrev = await pool.query(`SELECT COUNT(*) ${queryBasePrev}AND idetapa_matricula NOT IN (98,99)`, paramsPrev);
      const prevMat = parseInt(resultPrev.rows[0].count, 10) || 0;
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

    // 9. Última atualização (mantém igual)
    const ultimaAtualizacaoQuery = `
      SELECT (MAX(ultima_atualizacao) AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') 
      AS ultima_atualizacao 
      FROM dados_matriculas
    `;
    const ultimaAtualizacaoResult = await pool.query(ultimaAtualizacaoQuery);
    const ultimaAtualizacao = ultimaAtualizacaoResult.rows[0].ultima_atualizacao;

    // 10. Retorna todos os dados para o frontend
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

// Mantém o buscarFiltros igual ao seu original (usando buildWhereClause)
const buscarFiltros = async (req, res) => {
  try {
    const filters = req.body || {};
    const { clause, params } = buildWhereClause(filters, req.user);

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

// === BREAKDOWNS (filtros aplicados inclusive idescola) ===
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
      idcliente,
      idescola // ESSENCIAL!
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
      idcliente,
      idescola
    }, req.user);

    const queryBase = `FROM dados_matriculas WHERE ${clause} `;
    const queryBaseFiltrada = queryBase + "AND idetapa_matricula NOT IN (98,99) ";

    // Matrículas por Zona
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
