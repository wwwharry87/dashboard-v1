const pool = require('../config/db');

const getClientes = async (req, res) => {
  try {
    // Exemplo: supondo que a tabela "clientes" tenha uma coluna "usuario_id"
    // e que o authMiddleware tenha colocado o id do usuário em req.user.id
    const result = await pool.query("SELECT * FROM clientes WHERE usuario_id = $1", [req.user.id]);
    res.json({ clientes: result.rows });
  } catch (error) {
    console.error("Erro ao buscar clientes:", error);
    res.status(500).json({ error: "Erro ao buscar clientes", details: error.message });
  }
};

module.exports = { getClientes };
