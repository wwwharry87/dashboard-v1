require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const clientRoutes = require('./routes/clientRoutes');

const app = express();
const port = process.env.PORT || 5001;

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Rotas protegidas
app.use('/api', authRoutes);
app.use('/api', dashboardRoutes);

// Endpoint de clientes protegido (usa token para filtrar os clientes autorizados)
app.use('/api/client', clientRoutes);

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
