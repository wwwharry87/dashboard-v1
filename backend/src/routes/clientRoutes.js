const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authMiddleware = require('../middlewares/authMiddleware');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const allowedClients = req.user.allowedClients; // Vindo do token
    if (!allowedClients || allowedClients.length === 0) {
      return res.status(404).json({ error: 'Nenhum cliente autorizado encontrado' });
    }
    // Consulta a tabela "clientes" para retornar os registros cujo idcliente esteja na lista allowedClients.
    // Ajuste o nome da coluna se necessário; aqui assumimos que a chave primária em "clientes" é "idcliente"
    const result = await pool.query(
      'SELECT idcliente, cliente FROM clientes WHERE idcliente = ANY($1)',
      [allowedClients]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Nenhum cliente encontrado' });
    }
    // Se houver mais de um cliente autorizado, você pode escolher retornar o primeiro ou retornar todos em um array.
    // Aqui retornaremos o primeiro.
    res.json({ cliente: result.rows[0].cliente });
  } catch (error) {
    console.error("Erro ao buscar cliente:", error);
    res.status(500).json({ error: 'Erro ao buscar cliente' });
  }
});

module.exports = router;
