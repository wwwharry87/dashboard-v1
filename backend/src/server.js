const express = require("express");
const cors = require("cors");
const authMiddleware = require('./middlewares/authMiddleware');
const dashboardRoutes = require("./routes/dashboardRoutes");
const authRoutes = require("./routes/authRoutes");

const app = express();

// Configura o CORS para permitir requisições do frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || "https://ge-dashboard.onrender.com",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// Middleware para parsear JSON
app.use(express.json());

// Rotas de autenticação (públicas)
app.use("/api/auth", authRoutes);

// Rotas protegidas por autenticação
app.use("/api", authMiddleware, dashboardRoutes);

// Inicia o servidor
const port = process.env.PORT || 5001;
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
