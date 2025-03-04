const pool = require('../config/db');

//
// Função auxiliar para construir a cláusula WHERE
//
const buildWhereClause = (filters) => {
  const whereClauses = ["1=1"];
  const params = [];
  const addFilter = (value, field) => {
    if (value && value !== "") {
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
  addFilter(filters.idescola, "idescola");

  return { clause: whereClauses.join(" AND "), params };
};

//
// Função para buscar os totais e dados gerais
//
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
      idescola: req.body.idescola
    };

    // Constrói a cláusula WHERE
    const { clause, params } = buildWhereClause(filters);
    const queryBase = `FROM dados_matriculas WHERE ${clause} `;
    const queryBaseFiltrada = queryBase + "AND idetapa_matricula NOT IN (98,99) ";

    // Queries principais para o ano atual
    const queriesMain = {
      totalMatriculas: `SELECT COUNT(*) ${queryBaseFiltrada}`,
      totalEscolas: `SELECT COUNT(DISTINCT idescola) ${queryBase}`,
      totalVagas: `SELECT SUM(limite_maximo_aluno) ${queryBase}`,
      totalEntradas: `SELECT COUNT(*) ${queryBase}AND entrada_mes_tipo IS NOT NULL AND entrada_mes_tipo != '-'`,
      totalSaidas: `SELECT COUNT(*) ${queryBase}AND saida_mes_situacao IS NOT NULL AND saida_mes_situacao != '-'`
    };

    const resultsMain = await Promise.all(
      Object.values(queriesMain).map(q => pool.query(q, params))
    );

    // Última atualização
    const ultimaAtualizacaoQuery = `SELECT MAX(ultima_atualizacao) AS ultima_atualizacao FROM dados_matriculas`;
    const ultimaAtualizacaoResult = await pool.query(ultimaAtualizacaoQuery);
    const ultimaAtualizacao = ultimaAtualizacaoResult.rows[0].ultima_atualizacao;

    // Breakdown: Matrículas por Zona, Sexo e Turno (apenas para grupo_etapa "complementar")
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

    // Dados das escolas
    const escolasQuery = `
      WITH turmas AS (
        SELECT DISTINCT escola, idescola, idturma, limite_maximo_aluno
        ${queryBase}
      ),
      totalMatriculas AS (
        SELECT idescola, COUNT(*) FILTER (
          WHERE situacao_matricula = 'ATIVO' AND idetapa_matricula NOT IN (98,99)
        ) AS qtde_matriculas
        ${queryBase}
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

    // Dados de entradas e saídas por mês
    const entradasSaidasQuery = `
      SELECT TO_CHAR(data_matricula, 'MM') AS mes,
        COUNT(*) FILTER (WHERE entrada_mes_tipo IS NOT NULL AND entrada_mes_tipo != '-') AS entradas,
        COUNT(*) FILTER (WHERE saida_mes_situacao IS NOT NULL AND saida_mes_situacao != '-') AS saidas
      ${queryBase}
      GROUP BY mes
      ORDER BY mes
    `;
    const entradasSaidasResult = await pool.query(entradasSaidasQuery, params);
    const entradasSaidasPorMes = {};
    const nomesMeses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    entradasSaidasResult.rows.forEach(row => {
      const mesAbreviado = nomesMeses[parseInt(row.mes, 10) - 1] || row.mes;
      entradasSaidasPorMes[mesAbreviado] = {
        entradas: row.entradas || 0,
        saidas: row.saidas || 0,
      };
    });

    // Dados de escolas por zona
    const escolasZonaQuery = `SELECT zona_escola, COUNT(DISTINCT idescola) as total ${queryBase}GROUP BY zona_escola `;
    const resultEscolasZona = await pool.query(escolasZonaQuery, params);
    const escolasPorZona = {};
    resultEscolasZona.rows.forEach(row => {
      escolasPorZona[row.zona_escola] = parseInt(row.total, 10);
    });

    // Cálculo do comparativo e tendência para matrículas (baseado no ano anterior)
    let trendMatriculas = null;
    if (ano_letivo) {
      const prevYear = (parseInt(ano_letivo, 10) - 1).toString();
      // Constrói a cláusula WHERE para o ano anterior
      const { clause: clausePrev, params: paramsPrev } = buildWhereClause({
        anoLetivo: prevYear,
        deficiencia,
        grupoEtapa: grupo_etapa,
        etapaMatricula: etapa_matricula,
        etapaTurma: etapa_turma,
        multisserie,
        situacaoMatricula: situacao_matricula,
        tipoMatricula: tipo_matricula,
        tipoTransporte: tipo_transporte,
        transporteEscolar: transporte_escolar,
        idescola
      });
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
          missing: diff, // se diff > 0, faltam matrículas; se diff < 0, excedeu
          percent: parseFloat(percentMissing.toFixed(2)),
          arrow: diff > 0 ? "down" : diff < 0 ? "up" : ""
        };
      }
    }

    res.json({
      totalMatriculas: parseInt(resultsMain[0].rows[0].count, 10) || 0,
      totalEscolas: parseInt(resultsMain[1].rows[0].count, 10) || 0,
      totalVagas: parseInt(resultsMain[2].rows[0].sum, 10) || 0,
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

//
// Função para buscar os filtros disponíveis
//
const buscarFiltros = async (req, res) => {
  try {
    const filtrosResult = await pool.query(`
      SELECT DISTINCT 
        ano_letivo, deficiencia, grupo_etapa, etapa_matricula,
        etapa_turma, multisserie, situacao_matricula, tipo_matricula,
        tipo_transporte, transporte_escolar
      FROM dados_matriculas
      ORDER BY ano_letivo DESC
    `);
    const formatarFiltro = (key) => [...new Set(filtrosResult.rows.map(row => row[key]).filter(Boolean))];

    const etapasMatriculaResult = await pool.query(`
      SELECT grupo_etapa, array_agg(DISTINCT etapa_matricula) as etapas
      FROM dados_matriculas
      GROUP BY grupo_etapa
    `);
    const etapasMatriculaPorGrupo = {};
    etapasMatriculaResult.rows.forEach(row => {
      etapasMatriculaPorGrupo[row.grupo_etapa] = row.etapas || [];
    });

    const etapasTurmaResult = await pool.query(`
      SELECT grupo_etapa, array_agg(DISTINCT etapa_turma) as etapas
      FROM dados_matriculas
      GROUP BY grupo_etapa
    `);
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

//
// Função para buscar os breakdowns
//
const buscarBreakdowns = async (req, res) => {
  try {
    const {
      anoLetivo: ano_letivo,
      deficiencia,
      grupoEtapa: grupo_etapa,
      etapaMatricula: etapa_matricula,
      etapaTurma: etapa_turma,
      multisserie,
      situacaoMatricula: situacao_matricula,
      tipoMatricula: tipo_matricula,
      tipoTransporte: tipo_transporte,
      transporteEscolar: transporte_escolar,
      idescola // Filtro para escola
    } = req.body;

    const { clause, params } = buildWhereClause({
      anoLetivo: ano_letivo,
      deficiencia,
      grupoEtapa: grupo_etapa,
      etapaMatricula: etapa_matricula,
      etapaTurma: etapa_turma,
      multisserie,
      situacaoMatricula: situacao_matricula,
      tipoMatricula: tipo_matricula,
      tipoTransporte: tipo_transporte,
      transporteEscolar: transporte_escolar,
      idescola
    });
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
      const matriculasTurnoQuery = `SELECT turno, COUNT(*) as total ${queryBaseFiltrada}GROUP BY turno `;
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
