const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../config/db');

// A chave secreta deve ser armazenada em variável de ambiente
const secret = process.env.JWT_SECRET || 'sua_chave_secreta';

const loginController = async (req, res) => {
  const { email, senha } = req.body;

  try {
    // 1. Busca o usuário pelo email
    const usuarioResult = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (usuarioResult.rowCount === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }
    const usuario = usuarioResult.rows[0];
    
    // 2. Verifica a senha utilizando bcrypt para comparar o hash armazenado com a senha fornecida
    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ error: 'Senha inválida' });
    }
    
    // 3. Gera o token JWT
    const token = jwt.sign({ id: usuario.id, email: usuario.email }, secret, { expiresIn: '1h' });
    
    // 4. Retorna o token e os dados do usuário (sem a senha)
    delete usuario.senha;
    res.json({ token, usuario });
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
};

module.exports = { loginController };