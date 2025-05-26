const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Função de login
const login = async (req, res) => {
  console.time('LOGIN');
  const { cpf, password } = req.body; // 'password' é a senha digitada pelo usuário
  try {
    // Busca o usuário pela coluna CPF
    const result = await pool.query('SELECT * FROM usuarios WHERE cpf = $1', [cpf]);
    if (result.rows.length === 0) {
      console.timeEnd('LOGIN');
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }
    const user = result.rows[0];

    if (!user.senha) {
      console.timeEnd('LOGIN');
      return res.status(500).json({ error: 'Senha não configurada para este usuário' });
    }

    const isValid = await bcrypt.compare(password, user.senha);
    if (!isValid) {
      console.timeEnd('LOGIN');
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    // Busca os clientes vinculados ao usuário na tabela usuario_clientes
    const clientesResult = await pool.query(
      'SELECT idcliente FROM usuario_clientes WHERE usuario_id = $1',
      [user.id]
    );
    // Se o usuário estiver vinculado a vários clientes, pega apenas o primeiro
    const allowedClients = clientesResult.rows.length > 0 ? [clientesResult.rows[0].idcliente] : [];

    const tokenPayload = { 
      id: user.id,
      cpf: user.cpf,
      allowedClients
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '1d' });
    console.timeEnd('LOGIN');
    return res.json({ 
      token, 
      nome: user.nome,
      idcliente: allowedClients[0] || null  // <-- ADICIONE ISSO
    });

  } catch (error) {
    console.error('Erro no login:', error);
    console.timeEnd('LOGIN');
    return res.status(500).json({ error: 'Erro no login' });
  }
};

// Novo endpoint para redefinição de senha manual
const resetPasswordManual = async (req, res) => {
  const { cpf, nome, data_nascimento, telefone, idcliente, newPassword } = req.body;
  try {
    // Busca o usuário pela coluna CPF
    const userResult = await pool.query('SELECT * FROM usuarios WHERE cpf = $1', [cpf]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const user = userResult.rows[0];

    // Verifica se os dados informados conferem com os do usuário
    // Converte a data de nascimento para string no formato ISO (apenas a data)
    const userDataNascimento = new Date(user.data_nascimento).toISOString().split('T')[0];
    if (
      user.nome !== nome ||
      userDataNascimento !== data_nascimento ||
      user.telefone !== telefone
    ) {
      return res.status(401).json({ error: 'Detalhes do usuário não conferem.' });
    }

    // Verifica se há relação com o idcliente informado
    const ucResult = await pool.query(
      'SELECT * FROM usuario_clientes WHERE usuario_id = $1 AND idcliente = $2',
      [user.id, idcliente]
    );
    if (ucResult.rows.length === 0) {
      return res.status(401).json({ error: 'Cliente não autorizado para esse usuário.' });
    }

    // Hashifica a nova senha
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    // Atualiza a senha do usuário
    await pool.query(
      'UPDATE usuarios SET senha = $1 WHERE id = $2',
      [hashedPassword, user.id]
    );
    return res.json({ message: 'Senha redefinida com sucesso.' });
    
  } catch (error) {
    console.error('Erro em resetPasswordManual:', error);
    return res.status(500).json({ error: 'Erro ao redefinir senha.' });
  }
};

module.exports = { login, resetPasswordManual };
