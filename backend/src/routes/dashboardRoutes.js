const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middlewares/authMiddleware'); // Importa o middleware de autenticação

// Rota para buscar totais e dados da dashboard com filtros aplicáveis
// Protegida pelo middleware de autenticação
router.post('/totais', authMiddleware, dashboardController.buscarTotais);

// Rota para buscar filtros ordenados e agrupados por grupo_etapa
router.get('/filtros', authMiddleware, dashboardController.buscarFiltros);

// Rota para buscar breakdowns (agora via POST)
// Protegida pelo middleware de autenticação
router.post('/breakdowns', authMiddleware, dashboardController.buscarBreakdowns);

module.exports = router;
