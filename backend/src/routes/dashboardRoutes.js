const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Rota para buscar totais e dados da dashboard com filtros aplicáveis
router.post('/totais', dashboardController.buscarTotais);

// Rota para buscar filtros ordenados e agrupados por grupo_etapa
router.get('/filtros', dashboardController.buscarFiltros);

// Rota para buscar breakdowns (agora via POST)
router.post('/breakdowns', dashboardController.buscarBreakdowns);

module.exports = router;
