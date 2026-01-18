'use strict';

/**
 * mapController.js
 *
 * Mapa de escolas (pontos / calor)
 * - Retorna APENAS agregados
 * - Respeita multi-tenant via req.user.allowedClients
 */

const pool = require('../config/db');
const { buildWhereClause } = require('./dashboardController');

function isTruthy(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

const escolasAtivos = async (req, res) => {
  try {
    const filters = req.body?.filters || {};
    const onlyWithGeo = isTruthy(req.body?.onlyWithGeo);

    // Usa a mesma regra de filtros/tenant do dashboard
    const { clause, params } = buildWhereClause(filters, req.user);

    const geoWhereExtra = onlyWithGeo
      ? 'AND g.latitude IS NOT NULL AND g.longitude IS NOT NULL'
      : '';

    // Regra "ativo" igual ao resto do sistema
    const activeCond = "(UPPER(COALESCE(situacao_matricula,'')) IN ('ATIVO','ATIVA') OR COALESCE(idsituacao,0)=0)";

    const sql = `
      WITH base AS (
        SELECT idcliente, idescola, idmatricula, situacao_matricula, idsituacao, idetapa_matricula
        FROM dados_matriculas
        WHERE ${clause}
      ), base_sem_especiais AS (
        SELECT * FROM base WHERE COALESCE(idetapa_matricula,0) NOT IN (98,99)
      ), agg AS (
        SELECT
          idcliente,
          idescola,
          COUNT(DISTINCT idmatricula) AS total,
          COUNT(DISTINCT CASE WHEN ${activeCond} THEN idmatricula END) AS ativos
        FROM base_sem_especiais
        GROUP BY idcliente, idescola
      )
      SELECT
        g.idcliente,
        g.idescola,
        g.nome,
        g.endereco,
        g.bairro,
        g.municipio,
        g.uf,
        g.latitude,
        g.longitude,
        g.geocode_source,
        g.geocode_quality,
        COALESCE(a.total,0)  AS total,
        COALESCE(a.ativos,0) AS ativos
      FROM escolas_geo g
      LEFT JOIN agg a
        ON a.idcliente = g.idcliente
       AND a.idescola  = g.idescola
      WHERE g.idcliente = ANY($1)
      ${geoWhereExtra}
      ORDER BY COALESCE(a.ativos,0) DESC, g.nome ASC;
    `;

    const result = await pool.query(sql, params);

    return res.json({
      ok: true,
      count: result.rows?.length || 0,
      points: (result.rows || []).map((r) => ({
        idcliente: Number(r.idcliente),
        idescola: Number(r.idescola),
        nome: r.nome,
        endereco: r.endereco,
        bairro: r.bairro,
        municipio: r.municipio,
        uf: r.uf,
        latitude: r.latitude === null ? null : Number(r.latitude),
        longitude: r.longitude === null ? null : Number(r.longitude),
        geocode_source: r.geocode_source,
        geocode_quality: r.geocode_quality,
        total: Number(r.total) || 0,
        ativos: Number(r.ativos) || 0,
      })),
    });
  } catch (err) {
    console.error('[mapController] Erro:', err);
    return res.status(500).json({ ok: false, error: 'Erro ao buscar dados do mapa', details: err.message });
  }
};

module.exports = { escolasAtivos };
