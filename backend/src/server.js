const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require("./config/db"); // Importe o pool de conexão do banco de dados

const app = express();

// Configura o CORS para permitir requisições do frontend
app.use(cors({
  origin: "https://ge-dashboard.onrender.com", // Domínio do frontend
  methods: ["GET", "POST", "PUT", "DELETE"], // Métodos permitidos
  credentials: true // Permite o envio de cookies e headers de autenticação
}));

// Middleware para parsear JSON
app.use(express.json());

// Rota de login
app.post("/api/login", async (req, res) => {
  const { email, senha } = req.body;

  try {
    // 1. Busca o usuário pelo email no banco de dados
    const usuarioResult = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    if (usuarioResult.rowCount === 0) {
      return res.status(401).json({ error: "Usuário não encontrado" });
    }
    const usuario = usuarioResult.rows[0];

    // 2. Compara a senha fornecida com a senha criptografada no banco
    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ error: "Senha inválida" });
    }

    // 3. Gera um token JWT
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email }, // Payload do token
      process.env.JWT_SECRET, // Chave secreta (armazenada no .env)
      { expiresIn: "1h" } // Tempo de expiração do token
    );

    // 4. Retorna o token e os dados do usuário (sem a senha)
    delete usuario.senha; // Remove a senha do objeto usuário
    res.json({ token, usuario });
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

// Rota de exemplo protegida
app.get("/api/dados", (req, res) => {
  // Verifica o token de autenticação
  const token = req.headers.authorization?.split(" ")[1]; // Extrai o token do header
  if (!token) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  try {
    // Verifica o token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ message: "Dados protegidos", usuario: decoded });
  } catch (error) {
    res.status(401).json({ error: "Token inválido ou expirado" });
  }
});

// Inicia o servidor
const port = process.env.PORT || 5001;
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});