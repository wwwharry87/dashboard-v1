const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Função de login
const login = async (req, res) => {
  console.time('LOGIN');
  const { cpf, password } = req.body;
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

    const allowedClients = clientesResult.rows.map(row => row.idcliente);

    // ✅ MELHORIA: incluir nome no token (para IA e UX sem depender do frontend)
    // Dica premium: use nome (e opcionalmente "role" se existir) e evite colocar dados sensíveis demais.
    const tokenPayload = {
      id: user.id,
      cpf: user.cpf,
      nome: user.nome, // ✅ ADICIONADO
      allowedClients,
      clientId: allowedClients[0] || null
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '1d' });

    console.timeEnd('LOGIN');
    return res.json({
      token,
      nome: user.nome,
      idcliente: allowedClients[0] || null
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

// Função para obter dados do usuário logado
const getUser = async (req, res) => {
  try {
    const user = req.user;

    // Busca os dados completos do usuário no banco
    const result = await pool.query('SELECT id, nome, cpf FROM usuarios WHERE id = $1', [user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const userData = result.rows[0];
    res.json({
      id: userData.id,
      nome: userData.nome,
      cpf: userData.cpf
    });
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.status(500).json({ error: 'Erro ao buscar dados do usuário' });
  }
};

module.exports = { login, resetPasswordManual, getUser };
