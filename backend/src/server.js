require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const clientRoutes = require('./routes/clientRoutes');

const app = express();
const port = process.env.PORT || 5001;

// Configuração do CORS para permitir apenas o frontend no Render
app.use(cors({
  origin: 'https://ge-dashboard.onrender.com', // URL do seu frontend
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Adicione outros métodos se necessário
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // Se estiver usando cookies ou sessões
}));

// Middlewares
app.use(bodyParser.json());

// Rotas protegidas
app.use('/api', authRoutes);
app.use('/api', dashboardRoutes);
app.use('/api/client', clientRoutes);

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});