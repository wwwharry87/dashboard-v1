// controllers/loginController.js
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
    
    // 3. Busca os clientes associados ao usuário
    const clientesResult = await pool.query(
      `SELECT c.* 
       FROM usuario_clientes uc
       JOIN clientes c ON uc.idcliente = c.idcliente
       WHERE uc.usuario_id = $1`,
      [usuario.id]
    );
    
    const clientes = clientesResult.rows;
    // Seleciona o primeiro cliente da lista (pode ser ajustado conforme a necessidade)
    const selectedCliente = clientes.length > 0 ? clientes[0] : null;
    
    // 4. Cria o payload para o token JWT
    const tokenPayload = {
      id: usuario.id,
      email: usuario.email,
      // Inclui dados do cliente selecionado e a lista de clientes para uso no front-end
      selectedCliente: selectedCliente ? { idcliente: selectedCliente.idcliente, cliente: selectedCliente.cliente } : null,
      clientes
    };
    
    // 5. Gera o token JWT (válido por 1 hora, por exemplo)
    const token = jwt.sign(tokenPayload, secret, { expiresIn: '1h' });
    
    // Remove a senha do objeto usuário antes de retornar a resposta
    delete usuario.senha;
    
    // 6. Retorna os dados do usuário, os clientes associados e o token JWT
    return res.json({
      token,
      usuario,
      clientes,
      selectedCliente
    });
    
  } catch (error) {
    console.error("Erro no login:", error);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
};

module.exports = { loginController };