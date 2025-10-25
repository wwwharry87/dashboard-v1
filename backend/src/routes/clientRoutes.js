const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authMiddleware = require('../middlewares/authMiddleware');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const allowedClients = req.user.allowedClients; // Vindo do token
    console.log('ClientRoutes - allowedClients:', allowedClients);
    
    if (!allowedClients || allowedClients.length === 0) {
      return res.status(404).json({ error: 'Nenhum cliente autorizado encontrado' });
    }
    
    // Consulta a tabela "clientes" para retornar os registros cujo idcliente esteja na lista allowedClients.
    const result = await pool.query(
      'SELECT idcliente, cliente FROM clientes WHERE idcliente = ANY($1)',
      [allowedClients]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Nenhum cliente encontrado' });
    }
    
    // Retorna o primeiro cliente (ou você pode ajustar para retornar todos se necessário)
    res.json({ 
      cliente: result.rows[0].cliente,
      idcliente: result.rows[0].idcliente
    });
  } catch (error) {
    console.error("Erro ao buscar cliente:", error);
    res.status(500).json({ error: 'Erro ao buscar cliente' });
  }
});

module.exports = router;