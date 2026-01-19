'use strict';

function requireAdmin(req, res, next) {
  // Ajuste conforme seu user payload.
  // Exemplos comuns:
  // - req.user.role === 'ADMIN'
  // - req.user.isAdmin === true
  const role = String(req.user?.role || '').toUpperCase();
  const isAdmin = req.user?.isAdmin === true;

  if (role === 'ADMIN' || isAdmin) return next();

  return res.status(403).json({
    ok: false,
    error: 'Apenas ADMIN pode executar essa ação.',
  });
}

module.exports = { requireAdmin };
