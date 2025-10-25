const fs = require("fs");
const path = require("path");

// Caminho para o arquivo .env (na raiz do projeto)
const envPath = path.join(__dirname, ".env");

// Tenta ler o conteúdo do .env
let envContent = "";
try {
  envContent = fs.readFileSync(envPath, { encoding: "utf8" });
} catch (err) {
  console.warn("Arquivo .env não encontrado, criando um novo.");
  envContent = "";
}

// Procura pela variável de versão no .env
let currentVersion = "0";
const versionRegex = /^REACT_APP_VERSION=(.*)$/m;
const match = envContent.match(versionRegex);
if (match) {
  currentVersion = match[1].trim();
}

// Se a versão atual for "0", a tratamos como "0.0.0"
if (currentVersion === "0") {
  currentVersion = "0.0.0";
}

// Lê o tipo de deploy passado como argumento na linha de comando
// Deve ser "both", "backend" ou "frontend"
const deployType = process.argv[2];
if (!deployType || !["both", "backend", "frontend"].includes(deployType)) {
  console.error("Por favor, especifique o tipo de deploy: both, backend ou frontend");
  process.exit(1);
}

// Função para atualizar a versão
function updateVersion(currentVersion, deployType) {
  let [major, minor, patch] = currentVersion.split(".").map(Number);
  if (deployType === "both" || deployType === "backend") {
    minor = minor + 1;
    patch = 1;
  } else if (deployType === "frontend") {
    patch = patch + 1;
  } else {
    throw new Error("Tipo de deploy inválido");
  }
  return `${major}.${minor}.${patch}`;
}

const newVersion = updateVersion(currentVersion, deployType);

// Atualiza também a variável com a data/hora do deploy (no formato ISO)
const newDeployDate = new Date().toISOString();

// Atualiza o conteúdo do .env com as novas variáveis
let newEnvContent = envContent;

// Atualiza a versão
if (newEnvContent.match(versionRegex)) {
  newEnvContent = newEnvContent.replace(versionRegex, `REACT_APP_VERSION=${newVersion}`);
} else {
  newEnvContent += `\nREACT_APP_VERSION=${newVersion}\n`;
}

// Atualiza ou adiciona a data do deploy
const dateRegex = /^REACT_APP_VERSION_UPDATED_DATE=(.*)$/m;
if (newEnvContent.match(dateRegex)) {
  newEnvContent = newEnvContent.replace(dateRegex, `REACT_APP_VERSION_UPDATED_DATE=${newDeployDate}`);
} else {
  newEnvContent += `\nREACT_APP_VERSION_UPDATED_DATE=${newDeployDate}\n`;
}

// Escreve o novo conteúdo no .env
fs.writeFileSync(envPath, newEnvContent, { encoding: "utf8" });
console.log("Versão atualizada para:", newVersion);
console.log("Data do deploy atualizada para:", newDeployDate);
