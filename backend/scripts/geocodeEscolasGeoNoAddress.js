/* eslint-disable no-console */
'use strict';

require('dotenv').config();


const pool = require('../src/config/db');


// Nominatim (OSM) - grátis
const NOMINATIM_URL = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';

// Respeitar política de uso (não spammar)
const REQUEST_DELAY_MS = Number(process.env.GEOCODE_DELAY_MS || 1100);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function argMap(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const [k, v] = a.split('=');
    if (k && v && k.startsWith('--')) out[k.slice(2)] = v;
  }
  return out;
}

function normalizeSpaces(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function cleanSchoolName(name) {
  let n = normalizeSpaces(name);

  // remove trechos "ANEXO ..." e coisas entre parênteses
  n = n.replace(/\(.*?\)/g, ' ');
  n = n.replace(/\bANEXO\b.*$/i, ' ');
  n = normalizeSpaces(n);

  // padroniza abreviações comuns
  // EMEF / EMEIF / EMEI / CMEI etc. -> "Escola Municipal" (ajuda no geocode)
  n = n.replace(/\bE\s*M\s*E\s*I\s*F\b/gi, 'Escola Municipal');
  n = n.replace(/\bE\s*M\s*E\s*F\b/gi, 'Escola Municipal');
  n = n.replace(/\bE\s*M\s*E\s*I\b/gi, 'Escola Municipal');
  n = n.replace(/\bC\s*M\s*E\s*I\b/gi, 'Centro Municipal de Educação Infantil');
  n = n.replace(/\bE\.?M\.?E\.?F\.?\b/gi, 'Escola Municipal');
  n = n.replace(/\bE\.?M\.?E\.?I\.?F\.?\b/gi, 'Escola Municipal');

  // remove aspas e pontuação “solta”
  n = n.replace(/[“”"'`]/g, '');
  n = n.replace(/\s+-\s+/g, ' ');
  n = normalizeSpaces(n);

  return n;
}

async function nominatimSearch(params) {
  const qs = new URLSearchParams(params);
  const url = `${NOMINATIM_URL}?${qs.toString()}`;

  const resp = await fetch(url, {
    headers: {
      // IMPORTANTE: Nominatim pede identificador.
      // Coloque um email seu no env NOMINATIM_EMAIL ou mude aqui.
      'User-Agent': process.env.NOMINATIM_UA || 'dashboard-matriculas/1.0 (contato: suporte@bwsolucoesinteligentes.com)',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.5',
    },
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Nominatim HTTP ${resp.status}: ${txt.slice(0, 200)}`);
  }
  return resp.json();
}

async function getClienteContext(idcliente) {
  const r = await pool.query(
    `SELECT COALESCE(municipio, cliente) AS municipio, 'PA' AS uf
     FROM clientes
     WHERE idcliente = $1
     LIMIT 1`,
    [idcliente]
  );
  const row = r.rows?.[0];
  return {
    municipio: normalizeSpaces(row?.municipio || ''),
    uf: normalizeSpaces(row?.uf || 'PA'),
  };
}

async function getMunicipioAnchor(municipio, uf) {
  // Primeiro tentamos achar o município (ponto e bounding box)
  const q = `${municipio}, ${uf}, Brasil`;
  const results = await nominatimSearch({
    q,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '1',
    countrycodes: 'br',
  });

  const top = results?.[0];
  if (!top) return null;

  const lat = Number(top.lat);
  const lon = Number(top.lon);
  const bb = top.boundingbox?.map(Number); // [south, north, west, east]

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return {
    lat,
    lon,
    viewbox: bb && bb.length === 4
      ? { south: bb[0], north: bb[1], west: bb[2], east: bb[3] }
      : null,
  };
}

function buildSchoolQueries(nomeLimpo, municipio, uf) {
  // Tentativas em ordem (mais “precisa” -> mais “frouxa”)
  const basic = `${nomeLimpo}, ${municipio}, ${uf}`;
  const withMunicipal = `${nomeLimpo} escola, ${municipio}, ${uf}`;
  const withoutUf = `${nomeLimpo}, ${municipio}`;
  const withoutPrefix = `${stripAccents(nomeLimpo)}, ${municipio}, ${uf}`;

  // remove duplicatas
  const list = [basic, withMunicipal, withoutUf, withoutPrefix]
    .map(normalizeSpaces)
    .filter(Boolean);

  return Array.from(new Set(list));
}

async function geocodeSchoolInMunicipio(nome, municipio, uf, municipioAnchor) {
  const nomeLimpo = cleanSchoolName(nome);
  const qs = buildSchoolQueries(nomeLimpo, municipio, uf);

  for (const q of qs) {
    const params = {
      q,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '1',
      countrycodes: 'br',
    };

    // se temos bounding box do município, restringe a busca dentro dele
    if (municipioAnchor?.viewbox) {
      const { west, south, east, north } = municipioAnchor.viewbox;
      params.viewbox = `${west},${south},${east},${north}`;
      params.bounded = '1';
    }

    const results = await nominatimSearch(params);
    const top = results?.[0];
    if (top?.lat && top?.lon) {
      return {
        lat: Number(top.lat),
        lon: Number(top.lon),
        source: 'nominatim',
        quality: municipioAnchor?.viewbox ? 'school_in_viewbox' : 'school_anywhere',
        displayName: top.display_name || null,
      };
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return null;
}

async function main() {
  const args = argMap(process.argv);
  const idcliente = Number(args.idcliente);
  const limit = Math.min(Math.max(Number(args.limit || 50), 1), 500);
  const fallback = String(args.fallback || 'municipio').toLowerCase(); // municipio | none

  if (!Number.isFinite(idcliente)) {
    console.error('Uso: node scripts/geocodeEscolasGeoNoAddress.js --idcliente=1503606 --limit=50 --fallback=municipio');
    process.exit(1);
  }

  const ctx = await getClienteContext(idcliente);
  if (!ctx.municipio) {
    console.error('Não encontrei o município na tabela clientes para esse idcliente.');
    process.exit(1);
  }

  console.log(`Geocoding (sem endereço) — idcliente=${idcliente} — limit=${limit}`);
  console.log(`Contexto: municipio='${ctx.municipio}', uf='${ctx.uf}'`);

  const municipioAnchor = await getMunicipioAnchor(ctx.municipio, ctx.uf);
  if (!municipioAnchor) {
    console.warn('⚠️ Não consegui geocodar o município (anchor). Vou tentar sem viewbox.');
  } else {
    console.log(`Anchor município: lat=${municipioAnchor.lat}, lon=${municipioAnchor.lon}`);
  }

  // pega escolas sem lat/lon
  const r = await pool.query(
    `SELECT idescola, COALESCE(nome, '') AS nome
     FROM escolas_geo
     WHERE idcliente = $1
       AND (latitude IS NULL OR longitude IS NULL)
     ORDER BY idescola
     LIMIT $2`,
    [idcliente, limit]
  );

  const rows = r.rows || [];
  console.log(`Faltando geocodificar: ${rows.length} (limit=${limit})`);

  let ok = 0;
  let fail = 0;
  let fallbackCount = 0;

  for (const row of rows) {
    const idescola = Number(row.idescola);
    const nome = normalizeSpaces(row.nome);

    // tenta achar “de verdade”
    let geo = null;
    try {
      geo = await geocodeSchoolInMunicipio(nome, ctx.municipio, ctx.uf, municipioAnchor);
    } catch (e) {
      console.warn(`⚠️ Erro Nominatim: idescola=${idescola} — ${e.message}`);
    }

    // se não achou, aplica fallback no centróide do município (pra não quebrar o mapa)
    if (!geo && fallback === 'municipio' && municipioAnchor) {
      geo = {
        lat: municipioAnchor.lat,
        lon: municipioAnchor.lon,
        source: 'nominatim',
        quality: 'municipio_centroid',
        displayName: `${ctx.municipio}-${ctx.uf} (centroid)`,
      };
      fallbackCount++;
    }

    if (!geo) {
      console.log(`✖ NÃO ENCONTRADO: idescola=${idescola} — '${nome}'`);
      fail++;
      continue;
    }

    await pool.query(
      `UPDATE escolas_geo
         SET latitude = $1,
             longitude = $2,
             geocode_source = $3,
             geocode_quality = $4,
             updated_at = now()
       WHERE idcliente = $5 AND idescola = $6`,
      [geo.lat, geo.lon, geo.source, geo.quality, idcliente, idescola]
    );

    const tag = geo.quality === 'municipio_centroid' ? '≈' : '✓';
    console.log(`${tag} OK: idescola=${idescola} — '${nome}' -> (${geo.lat}, ${geo.lon}) [${geo.quality}]`);
    ok++;

    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`Concluído: ok=${ok}, fail=${fail}, fallback(municipio)=${fallbackCount}`);
}

main().catch((e) => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
