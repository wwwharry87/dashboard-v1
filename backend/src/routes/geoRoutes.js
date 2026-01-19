'use strict';

const Router = require('express').Router;
const geoController = require('../controllers/geoController');

// Middleware de autenticação do projeto
// (exporta a função diretamente, não um objeto)
const authMiddleware = require('../middlewares/authMiddleware');

// Se você NÃO tem controle de role/admin ainda, pode comentar requireAdmin e usar só authMiddleware.
const { requireAdmin } = require('../middlewares/requireAdmin');

const router = Router();

// POST /api/geo/sync-escolas
router.post('/geo/sync-escolas', authMiddleware, requireAdmin, geoController.syncEscolas);

// POST /api/geo/geocode-escolas?limit=50
router.post('/geo/geocode-escolas', authMiddleware, requireAdmin, geoController.geocodeEscolas);

module.exports = router;
