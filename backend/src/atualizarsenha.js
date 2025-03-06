// Importa o dotenv para carregar as variáveis de ambiente
require("dotenv").config();

const { Pool } = require("pg");
const bcrypt = require("bcrypt");

// Configurações do banco de dados (usando a DATABASE_URL do .env)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Necessário para conexões SSL com o Render
  },
});

(async () => {
  try {
    console.log("Tentando conectar ao banco de dados...");

    // Testa a conexão com o banco de dados
    const client = await pool.connect();
    console.log("Conexão bem-sucedida!");

    // Busca todos os usuários
    const usuarios = await client.query("SELECT id, senha FROM usuarios");
    console.log(`Encontrados ${usuarios.rows.length} usuários.`);

    // Para cada usuário, criptografa a senha e atualiza no banco
    for (let usuario of usuarios.rows) {
      const senhaCriptografada = await bcrypt.hash(usuario.senha, 10); // 10 é o custo do hash
      await client.query("UPDATE usuarios SET senha = $1 WHERE id = $2", [
        senhaCriptografada,
        usuario.id,
      ]);
      console.log(`Senha do usuário ${usuario.id} criptografada.`);
    }

    console.log("Todas as senhas foram criptografadas com sucesso!");
  } catch (error) {
    console.error("Erro ao criptografar senhas:", error);
  } finally {
    await pool.end();
    console.log("Conexão com o banco de dados fechada.");
  }
})();