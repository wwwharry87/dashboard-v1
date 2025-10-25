const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Token de acesso não fornecido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Estrutura padrão do usuário - compatível com o que foi enviado no login
    req.user = {
      id: decoded.id,
      cpf: decoded.cpf,
      clientId: decoded.clientId || decoded.idcliente,
      allowedClients: decoded.allowedClients || []
    };
    
    // Log para debug
    console.log('Usuário autenticado:', {
      id: req.user.id,
      clientId: req.user.clientId,
      allowedClients: req.user.allowedClients
    });
    
    next();
  } catch (error) {
    console.error('Erro na verificação do token:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    
    return res.status(500).json({ error: 'Erro na autenticação' });
  }
};

module.exports = authMiddleware;