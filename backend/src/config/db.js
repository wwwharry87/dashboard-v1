// src/config/db.js
// Pool de conexao Postgres.
// IMPORTANTE: este modulo e usado tanto pelo servidor quanto por scripts
// executados via `node scripts/*.js`. Por isso carregamos o .env aqui,
// evitando que scripts caiam no default localhost:5432.
require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render Postgres geralmente exige SSL
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
});

module.exports = pool;
