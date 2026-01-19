'use strict';

/**
 * geocodeEscolasGeoNoAddress.js
 *
 * Preenche latitude/longitude na tabela escolas_geo SEM endereço,
 * usando apenas (nome + municipio + uf). Usa Nominatim (OpenStreetMap).
 *
 * Uso:
 *   node backend/scripts/geocodeEscolasGeoNoAddress.js --idcliente=1503606 --limit=200
 *
 * Dicas:
 * - Ajuste USER_AGENT_EMAIL via env GEOCODER_CONTACT
 * - Script tem rate limit (~1.1s por request)
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

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildQueryRow(r) {
  // Sem endereço: nome + municipio + uf + Brasil
  const parts = [r.nome, r.municipio, r.uf, 'Brasil'].filter(Boolean).map(String);
  return parts.join(', ');
}

function scoreHit(hit, r) {
  let score = 0;

  const addr = hit.address || {};
  const qNome = norm(r.nome);
  const qMun = norm(r.municipio);

  const display = norm(hit.display_name);
  const name = norm(hit.name || hit.display_name);
  const city = norm(addr.city || addr.town || addr.village || addr.municipality || addr.county);
  const state = norm(addr.state || addr.region);

  // Brasil
  if (String(addr.country_code || '').toLowerCase() === 'br') score += 2;

  // Estado do Pará (ou "para" normalizado)
  if (state.includes('para')) score += 3;
  else if (state) score -= 1;

  // Município
  if (qMun && city && city === qMun) score += 3;
  else if (qMun && (display.includes(qMun) || name.includes(qMun))) score += 1;

  // Tipo escola
  if (hit.class === 'amenity' && (hit.type === 'school' || hit.type === 'college' || hit.type === 'university')) score += 3;
  if ((hit.category || '').includes('education')) score += 2;

  // Similaridade do nome (bem simples)
  if (qNome && name && (name.includes(qNome) || qNome.includes(name))) score += 2;
  else {
    // bônus por palavras em comum
    const wsQ = new Set(qNome.split(' ').filter((w) => w.length > 2));
    const wsN = new Set(name.split(' ').filter((w) => w.length > 2));
    let common = 0;
    for (const w of wsQ) if (wsN.has(w)) common += 1;
    score += Math.min(common, 3);
  }

  // Penaliza POI estranho
  if (hit.class && hit.class !== 'amenity') score -= 1;

  return score;
}

async function geocodeMany(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&namedetails=1&limit=5&countrycodes=br&q=${encodeURIComponent(q)}`;
  const contact = process.env.GEOCODER_CONTACT || 'contato@bwsolucoesinteligentes.com';

  const resp = await fetch(url, {
    headers: {
      'User-Agent': `dashboard-matriculas/1.0 (${contact})`,
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  });

  if (!resp.ok) throw new Error(`Nominatim HTTP ${resp.status}`);
  const json = await resp.json();
  return Array.isArray(json) ? json : [];
}

async function main() {
  const idcliente = Number(arg('idcliente', '0'));
  const limit = Math.min(Math.max(Number(arg('limit', '150')), 1), 1000);
  const dryRun = String(arg('dryRun', '0')) === '1';

  if (!idcliente) {
    console.error('Informe --idcliente=XXXX');
    process.exit(1);
  }

  const sel = await pool.query(
    `SELECT idcliente, idescola, nome, municipio, uf
     FROM escolas_geo
     WHERE idcliente = $1
       AND (latitude IS NULL OR longitude IS NULL)
       AND COALESCE(nome,'') <> ''
       AND COALESCE(municipio,'') <> ''
       AND COALESCE(uf,'') <> ''
     ORDER BY updated_at ASC
     LIMIT $2`,
    [idcliente, limit]
  );

  console.log(`Encontradas ${sel.rows.length} escolas para geocodificar (sem endereço) (idcliente=${idcliente}).`);

  let ok = 0;
  let skipped = 0;

  for (const r of sel.rows) {
    const q = buildQueryRow(r);

    try {
      const hits = await geocodeMany(q);
      if (!hits.length) {
        console.log(`- sem resultado: idescola=${r.idescola} | ${q}`);
        skipped += 1;
      } else {
        let best = null;
        let bestScore = -999;

        for (const h of hits) {
          const lat = Number(h.lat);
          const lon = Number(h.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          const s = scoreHit(h, r);
          if (s > bestScore) {
            bestScore = s;
            best = h;
          }
        }

        if (!best || bestScore < 3) {
          console.log(`- baixa confiança: idescola=${r.idescola} | score=${bestScore} | ${q}`);
          skipped += 1;
        } else {
          const lat = Number(best.lat);
          const lon = Number(best.lon);

          if (!dryRun) {
            await pool.query(
              `UPDATE escolas_geo
               SET latitude=$1, longitude=$2,
                   geocode_source='nominatim',
                   geocode_quality=$3,
                   updated_at=now()
               WHERE idcliente=$4 AND idescola=$5`,
              [
                lat,
                lon,
                `score:${bestScore};class:${best.class || ''};type:${best.type || ''}`,
                r.idcliente,
                r.idescola,
              ]
            );
          }

          ok += 1;
          console.log(`+ OK idescola=${r.idescola} -> (${lat}, ${lon}) score=${bestScore}`);
        }
      }
    } catch (e) {
      console.log(`! erro idescola=${r.idescola}: ${e.message}`);
      skipped += 1;
    }

    // respeita rate limit
    await sleep(1100);
  }

  console.log(`Finalizado. Atualizadas: ${ok} | Sem/baixa confiança: ${skipped} | dryRun=${dryRun}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
