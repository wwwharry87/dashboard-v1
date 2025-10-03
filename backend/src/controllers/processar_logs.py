import re
import pandas as pd

def is_new_entry(line):
    return bool(re.match(r"^[a-f0-9\-]{36}\|\d{6,}:", line))

def traduzir_sql_para_usuario(sql):
    sql_l = sql.lower()
    if "from sch_geweb.movimentacao_funcionario" in sql_l:
        return "Consulta dados de movimentação de funcionários, como unidade, cargo, carga horária e situação funcional, conforme os filtros aplicados."
    if "from sch_geweb.turma_disciplina" in sql_l:
        return "Busca informações das disciplinas de uma turma, incluindo carga horária, professores, turmas e etapas de ensino."
    if "update" in sql_l:
        return "Atualiza informações no sistema conforme os campos informados."
    if "delete" in sql_l:
        return "Remove registros do sistema conforme os critérios informados."
    if "insert" in sql_l:
        return "Adiciona novos registros ao sistema conforme os campos preenchidos."
    if "select" in sql_l:
        return "Consulta dados no banco de dados, retornando informações específicas de acordo com o filtro."
    return "Comando SQL identificado. Para mais detalhes, consulte o setor técnico."

# Caminho do arquivo CSV
arquivo_entrada = "/Users/wesleymelo/Desktop/log_bruno.csv"

# 1. Agrupar todos os registros do log
entries = []
buffer = []
with open(arquivo_entrada, "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()
for line in lines:
    if is_new_entry(line):
        if buffer:
            entries.append(''.join(buffer))
            buffer = []
    buffer.append(line)
if buffer:
    entries.append(''.join(buffer))

# 2. Extrair informações de cada entrada
data = []
for entry in entries:
    parts = entry.split('|', 3)
    if len(parts) < 4:
        continue
    timestamp = parts[2].strip()
    match = re.search(r'\b(SELECT|UPDATE|DELETE|INSERT)\b', parts[3], re.IGNORECASE)
    tipo_comando = match.group(1).upper() if match else "DESCONHECIDO"
    explicacao = traduzir_sql_para_usuario(parts[3])
    data.append({
        "horario": timestamp,
        "tipo_comando": tipo_comando,
        "explicacao_usuario": explicacao
    })

# 3. Gerar único Excel com todos os registros
df = pd.DataFrame(data)
arquivo_saida = "/Users/wesleymelo/Desktop/log_visual_simples_completo.xlsx"
df.to_excel(arquivo_saida, index=False)

print("Arquivo gerado com sucesso:", arquivo_saida)
print(f"Total de registros: {len(df)}")
