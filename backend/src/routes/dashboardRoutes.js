const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middlewares/authMiddleware');

// Rota para buscar totais e dados da dashboard com filtros aplicáveis (protegida)
router.post('/totais', authMiddleware, dashboardController.buscarTotais);

// Rota para buscar filtros ordenados e agrupados por grupo_etapa (protegida)
router.get('/filtros', authMiddleware, dashboardController.buscarFiltros);

// Rota para buscar breakdowns (protegida)
router.post('/breakdowns', authMiddleware, dashboardController.buscarBreakdowns);

module.exports = router;