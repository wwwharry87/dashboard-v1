const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middlewares/authMiddleware');

// Aplica o middleware a todas as rotas abaixo
router.use(authMiddleware);

router.post('/totais', dashboardController.buscarTotais);
router.get('/filtros', dashboardController.buscarFiltros);
router.post('/breakdowns', dashboardController.buscarBreakdowns);

module.exports = router;
