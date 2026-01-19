'use strict';

const path = require('path');
const { spawn } = require('child_process');

/**
 * geoController.js
 * - endpoints para disparar scripts de sync/geocode em lote
 * - valida idcliente pelo usuário autenticado (allowedClients)
 *
 * Requisitos:
 * - existir scripts em: backend/scripts/
 *   - syncEscolasGeoFromDados.js
 *   - geocodeEscolasGeoNoAddress.js  (ou ajuste o nome abaixo)
 */

// Local dos scripts (prioriza ./scripts na raiz, mas faz fallback para ./src/scripts)
function resolveScriptsDir() {
  const candidates = [
    path.resolve(process.cwd(), 'scripts'),
    path.resolve(process.cwd(), 'src', 'scripts'),
  ];
  for (const dir of candidates) {
    try {
      // fs existe no Node; evitamos require no topo para manter arquivo leve
      const fs = require('fs');
      if (fs.existsSync(dir)) return dir;
    } catch (_) {}
  }
  return candidates[0];
}

const SCRIPTS_DIR = resolveScriptsDir();

const SCRIPT_SYNC = path.join(SCRIPTS_DIR, 'syncEscolasGeoFromDados.js');
// Sem endereço (nome + municipio + UF) — gratuito via Nominatim
const SCRIPT_GEOCODE_NOADDR = path.join(SCRIPTS_DIR, 'geocodeEscolasGeoNoAddress.js');
// Com endereço (se você tiver endereço/bairro)
const SCRIPT_GEOCODE_ADDR = path.join(SCRIPTS_DIR, 'geocodeEscolasGeo.js');

function normalizeIdcliente(req) {
  // prioridade: body -> query -> req.user.clientId
  const bodyId = req.body?.idcliente;
  const queryId = req.query?.idcliente;
  const userId = req.user?.clientId;

  const id = Number(bodyId ?? queryId ?? userId);
  return Number.isFinite(id) ? id : null;
}

function canAccessClient(req, idcliente) {
  const allowed = req.user?.allowedClients || [];
  // allowedClients pode vir como number/string
  return allowed.map(Number).includes(Number(idcliente));
}

function runNodeScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let out = '';
    let err = '';

    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) return resolve({ code, out, err });
      reject(new Error(`Script falhou (code=${code}).\n${err || out}`));
    });
  });
}

async function syncEscolas(req, res) {
  try {
    const idcliente = normalizeIdcliente(req);
    if (!idcliente) return res.status(400).json({ ok: false, error: 'idcliente inválido.' });

    if (!canAccessClient(req, idcliente)) {
      return res.status(403).json({ ok: false, error: 'Sem permissão para este idcliente.' });
    }

    // args do script
    const args = [`--idcliente=${idcliente}`];

    const result = await runNodeScript(SCRIPT_SYNC, args);

    return res.json({
      ok: true,
      action: 'sync',
      idcliente,
      output: result.out.slice(-8000), // evita resposta gigante
    });
  } catch (err) {
    console.error('[geoController.syncEscolas] erro:', err);
    return res.status(500).json({
      ok: false,
      error: 'Erro ao executar syncEscolas.',
      details: err.message,
    });
  }
}

async function geocodeEscolas(req, res) {
  try {
    const idcliente = normalizeIdcliente(req);
    if (!idcliente) return res.status(400).json({ ok: false, error: 'idcliente inválido.' });

    if (!canAccessClient(req, idcliente)) {
      return res.status(403).json({ ok: false, error: 'Sem permissão para este idcliente.' });
    }

    // limite por chamada (pra não estourar rate limit)
    const limit = Math.min(Math.max(Number(req.body?.limit ?? req.query?.limit ?? 50), 1), 200);

    const args = [`--idcliente=${idcliente}`, `--limit=${limit}`];

    // Mode opcional:
    // - "noaddr" (padrão): nome + municipio + UF
    // - "addr": usa geocodeEscolasGeo.js (quando você tiver endereço)
    const mode = String(req.body?.mode ?? req.query?.mode ?? 'noaddr').toLowerCase();
    const scriptPath = mode === 'addr' ? SCRIPT_GEOCODE_ADDR : SCRIPT_GEOCODE_NOADDR;

    const result = await runNodeScript(scriptPath, args);

    return res.json({
      ok: true,
      action: 'geocode',
      mode,
      idcliente,
      limit,
      output: result.out.slice(-8000),
    });
  } catch (err) {
    console.error('[geoController.geocodeEscolas] erro:', err);
    return res.status(500).json({
      ok: false,
      error: 'Erro ao executar geocodeEscolas.',
      details: err.message,
    });
  }
}

module.exports = {
  syncEscolas,
  geocodeEscolas,
};
