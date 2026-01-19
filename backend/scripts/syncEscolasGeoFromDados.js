'use strict';

/**
 * scripts/syncEscolasGeoFromDados.js
 *
 * Upsert de escolas na tabela escolas_geo a partir de dados_matriculas.
 * - NÃO exige endereço.
 * - Usa municipio/uf do cliente (tabela clientes). Se a coluna `uf` não existir, assume 'PA'.
 *
 * Uso:
 *   node scripts/syncEscolasGeoFromDados.js --idcliente=1503606
 */

const pool = require('../src/config/db');

function arg(name, def) {
  const pfx = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pfx));
  if (!hit) return def;
  return hit.slice(pfx.length);
}

async function getClienteInfo(idcliente) {
  // tenta com coluna uf
  try {
    const r = await pool.query(
      `SELECT idcliente, COALESCE(municipio,'') AS municipio, COALESCE(uf,'PA') AS uf
       FROM clientes
       WHERE idcliente=$1`,
      [idcliente]
    );
    return r;
  } catch (err) {
    // Se a coluna uf não existe ainda, cai para PA
    if (String(err?.code) === '42703' || /column\s+"uf"\s+does\s+not\s+exist/i.test(String(err?.message))) {
      const r = await pool.query(
        `SELECT idcliente, COALESCE(municipio,'') AS municipio
         FROM clientes
         WHERE idcliente=$1`,
        [idcliente]
      );
      // injeta uf em memória
      r.rows = (r.rows || []).map((x) => ({ ...x, uf: 'PA' }));
      return r;
    }
    throw err;
  }
}

async function main() {
  const idcliente = Number(arg('idcliente', '0'));
  if (!idcliente) {
    console.error('Informe --idcliente=XXXX');
    process.exit(1);
  }

  // Pega municipio/uf do cliente
  const c = await getClienteInfo(idcliente);

  if (!c.rows?.length) {
    console.error(`Cliente não encontrado para idcliente=${idcliente}`);
    process.exit(1);
  }

  const municipio = c.rows[0].municipio || '';
  const uf = String(c.rows[0].uf || 'PA').toUpperCase();

  // Distintos por idescola dentro do cliente
  const rows = await pool.query(
    `SELECT idcliente, idescola,
            MAX(escola)::text AS nome
     FROM dados_matriculas
     WHERE idcliente=$1
       AND idescola IS NOT NULL
     GROUP BY idcliente, idescola
     ORDER BY idescola ASC`,
    [idcliente]
  );

  console.log(`Encontradas ${rows.rows.length} escolas distintas em dados_matriculas (idcliente=${idcliente}).`);

  let upserts = 0;
  for (const r of rows.rows) {
    const nome = String(r.nome || '').trim();
    if (!nome) continue;

    await pool.query(
      `INSERT INTO escolas_geo (idcliente, idescola, nome, municipio, uf, updated_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (idcliente, idescola) DO UPDATE
       SET
         nome = COALESCE(NULLIF(EXCLUDED.nome,''), escolas_geo.nome),
         municipio = COALESCE(NULLIF(EXCLUDED.municipio,''), escolas_geo.municipio),
         uf = COALESCE(NULLIF(EXCLUDED.uf,''), escolas_geo.uf),
         updated_at = now()`,
      [idcliente, Number(r.idescola), nome, municipio, uf]
    );

    upserts += 1;
  }

  console.log(`Upserts concluídos: ${upserts}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
