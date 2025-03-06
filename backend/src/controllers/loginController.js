const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../config/db');

const secret = process.env.JWT_SECRET || 'sua_chave_secreta';

const loginController = async (req, res) => {
  const { email, senha } = req.body;

  try {
    // Busca o usuário pelo email
    const usuarioResult = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (usuarioResult.rowCount === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }
    const usuario = usuarioResult.rows[0];
    
    // Verifica a senha utilizando bcrypt
    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ error: 'Senha inválida' });
    }
    
    // Gera o token JWT
    const token = jwt.sign({ id: usuario.id, email: usuario.email }, secret, { expiresIn: '1h' });
    
    // Remove a senha antes de enviar a resposta
    delete usuario.senha;
    res.json({ token, usuario });
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ error: "Erro interno no servidor", details: error.message });
  }
};

module.exports = { loginController };