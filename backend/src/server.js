const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require("./config/db");
const authMiddleware = require("./middlewares/authMiddleware");
const dashboardRoutes = require("./routes/dashboardRoutes");
const authRoutes = require("./routes/authRoutes");

const app = express();

// Configura o CORS para permitir requisições do frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || "https://ge-dashboard.onrender.com", // Domínio do frontend
  methods: ["GET", "POST", "PUT", "DELETE"], // Métodos permitidos
  credentials: true // Permite o envio de cookies e headers de autenticação
}));

// Middleware para parsear JSON
app.use(express.json());

// Rotas de autenticação
app.use("/api/auth", authRoutes);

// Rotas protegidas por autenticação
app.use("/api", authMiddleware, dashboardRoutes);

// Inicia o servidor
const port = process.env.PORT || 5001;
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});