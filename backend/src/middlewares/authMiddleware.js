const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET || 'sua_chave_secreta';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token mal formatado' });

  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded; // Disponibiliza as informações do token para as próximas rotas
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

module.exports = authMiddleware;