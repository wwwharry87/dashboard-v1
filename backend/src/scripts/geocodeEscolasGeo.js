'use strict';

/**
 * geocodeEscolasGeo.js
 *
 * Script opcional (rode LOCALMENTE) para preencher latitude/longitude
 * na tabela escolas_geo usando Nominatim (OpenStreetMap) gratuitamente.
 *
 * Requisitos:
 * - Node 18+ (fetch global)
 * - campos endereco/municipio/uf preenchidos
 *
 * Uso:
 *   node src/scripts/geocodeEscolasGeo.js --idcliente=1503606 --limit=200
 */

const pool = require('../config/db');

function arg(name, def) {
  const pfx = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pfx));
  if (!hit) return def;
  return hit.slice(pfx.length);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildQueryRow(r) {
  const parts = [r.endereco, r.bairro, r.municipio, r.uf].filter(Boolean).map(String);
  return parts.join(', ');
}

async function geocodeOne(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const resp = await fetch(url, {
    headers: {
      // Nominatim pede um User-Agent identificável
      'User-Agent': 'dashboard-matriculas/1.0 (contato@exemplo.com)'
    }
  });
  if (!resp.ok) throw new Error(`Nominatim HTTP ${resp.status}`);
  const json = await resp.json();
  const item = Array.isArray(json) && json[0] ? json[0] : null;
  if (!item) return null;
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, raw: item };
}

async function main() {
  const idcliente = Number(arg('idcliente', '0'));
  const limit = Math.min(Math.max(Number(arg('limit', '100')), 1), 1000);

  if (!idcliente) {
    console.error('Informe --idcliente=XXXX');
    process.exit(1);
  }

  const sel = await pool.query(
    `SELECT idcliente, idescola, nome, endereco, bairro, municipio, uf
     FROM escolas_geo
     WHERE idcliente = $1
       AND (latitude IS NULL OR longitude IS NULL)
       AND COALESCE(endereco,'') <> ''
       AND COALESCE(municipio,'') <> ''
       AND COALESCE(uf,'') <> ''
     ORDER BY updated_at ASC
     LIMIT $2`,
    [idcliente, limit]
  );

  console.log(`Encontradas ${sel.rows.length} escolas para geocodificar (idcliente=${idcliente}).`);

  let ok = 0;
  for (const r of sel.rows) {
    const q = buildQueryRow(r);
    try {
      const hit = await geocodeOne(q);
      if (!hit) {
        console.log(`- sem resultado: idescola=${r.idescola} | ${q}`);
      } else {
        await pool.query(
          `UPDATE escolas_geo
           SET latitude=$1, longitude=$2, geocode_source='nominatim', geocode_quality='search', updated_at=now()
           WHERE idcliente=$3 AND idescola=$4`,
          [hit.lat, hit.lon, r.idcliente, r.idescola]
        );
        ok += 1;
        console.log(`+ OK idescola=${r.idescola} -> (${hit.lat}, ${hit.lon})`);
      }
    } catch (e) {
      console.log(`! erro idescola=${r.idescola}: ${e.message}`);
    }

    // respeita rate limit
    await sleep(1100);
  }

  console.log(`Finalizado. Atualizadas: ${ok}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
