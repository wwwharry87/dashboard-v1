const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded; // Disponibiliza os dados do usuário para os controllers
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Token inválido' });
    }
  } else {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
};

module.exports = authMiddleware;
