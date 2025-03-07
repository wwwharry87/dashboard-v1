const pool = require('../config/db');

const getClientes = async (req, res) => {
  try {
    // Verifica se o req.user.id está disponível
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    // Busca os clientes associados ao usuário através da tabela usuario_clientes
    const query = `
      SELECT c.* 
      FROM clientes c
      JOIN usuario_clientes uc ON c.id = uc.cliente_id
      WHERE uc.usuario_id = $1
    `;
    const values = [req.user.id];

    console.log("Executando query de clientes:", query, values);
    const result = await pool.query(query, values);
    console.log("Resultado da query:", result.rows);
    res.json({ clientes: result.rows });
  } catch (error) {
    console.error("Erro ao buscar clientes:", error);
    res.status(500).json({ error: "Erro ao buscar clientes", details: error.message });
  }
};

module.exports = { getClientes };