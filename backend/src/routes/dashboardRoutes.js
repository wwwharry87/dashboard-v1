
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const analyticsController = require('../controllers/analyticsController');
const authMiddleware = require('../middlewares/authMiddleware');

// Aplica o middleware a todas as rotas
router.use(authMiddleware);

// Rotas principais
router.post('/totais', dashboardController.buscarTotais);
router.get('/filtros', dashboardController.buscarFiltros);
router.post('/breakdowns', dashboardController.buscarBreakdowns);

// Novas rotas de analytics
router.post('/analytics', analyticsController.buscarAnalytics);
router.post('/alertas', analyticsController.buscarAlertas);

// Rota para limpar cache (útil para desenvolvimento)
router.delete('/cache', dashboardController.limparCache);

// Health check da dashboard
router.get('/health', (req, res) => {
  res.json({ 
    status: 'Dashboard API OK',
    user: req.user ? { 
      id: req.user.id, 
      clientId: req.user.clientId,
      allowedClients: req.user.allowedClients 
    } : 'No user',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
