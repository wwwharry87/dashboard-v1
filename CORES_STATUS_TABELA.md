# Sistema de Cores por Status - Tabela de Escolas

## Data: 28 de Janeiro de 2026 - v0.1.17

### Resumo

Implementado um sistema visual de cores que se aplica a **toda a linha** da tabela, permitindo identificar rapidamente o status de cada escola.

---

## 🎨 Paleta de Cores

### Verde - Escolas com Vagas
- **Status:** Com Vagas Disponíveis
- **Cor de Fundo:** `bg-green-50` (hover: `bg-green-100`)
- **Borda Esquerda:** `border-l-green-400`
- **Significado:** Escola tem vagas disponíveis para matrícula

**Exemplo:**
```
Escola: EMEF PROF° JOSÉ FLÁVIO ALVES DE LIMA
Matrículas: 959 | Capacidade: 970 | Vagas: 11
[Linha com fundo verde claro]
```

### Amarelo - Escolas Completas
- **Status:** Cheia (Capacidade Total Atingida)
- **Cor de Fundo:** `bg-yellow-50` (hover: `bg-yellow-100`)
- **Borda Esquerda:** `border-l-yellow-400`
- **Significado:** Escola atingiu a capacidade total, 0 vagas

**Exemplo:**
```
Escola: EMEF CRISTO REI
Matrículas: 883 | Capacidade: 917 | Vagas: 34
[Linha com fundo amarelo claro]
```

### Vermelho - Escolas Lotadas
- **Status:** Lotada (Acima da Capacidade)
- **Cor de Fundo:** `bg-red-50` (hover: `bg-red-100`)
- **Borda Esquerda:** `border-l-red-400`
- **Significado:** Escola ultrapassou a capacidade, tem excesso de alunos

**Exemplo:**
```
Escola: EMEF PROF.ª MARIA ILAN RODRIGUES JADÃO
Matrículas: 871 | Capacidade: 865 | Vagas: +6 acima
[Linha com fundo vermelho claro]
```

### Roxo - Escola Selecionada
- **Status:** Selecionada pelo Usuário
- **Cor de Fundo:** `bg-violet-100`
- **Borda Esquerda:** `border-l-violet-500`
- **Significado:** Escola está selecionada/em foco

---

## 📱 Aplicação em Desktop e Mobile

### Desktop (Tabela)
```
┌─────────────────────────────────────────────────────────┐
│ Escola │ Matrículas │ Capacidade │ Vagas │ Status      │
├─────────────────────────────────────────────────────────┤
│ [VERDE] Escola com Vagas                                │
│ [AMARELO] Escola Completa                               │
│ [VERMELHO] Escola Lotada                                │
└─────────────────────────────────────────────────────────┘
```

**Características:**
- Borda esquerda colorida (4px)
- Fundo com cor suave (50)
- Hover com cor mais intensa (100)
- Transição suave (200ms)

### Mobile (Cards)
```
┌────────────────────────────────┐
│ [VERDE] Escola com Vagas       │ ← Fundo verde
│ URBANA • 34 turmas             │ ← Borda verde
│ ┌──────┬──────┬──────┐         │
│ │ 959  │ 970  │  11  │         │
│ └──────┴──────┴──────┘         │
└────────────────────────────────┘
```

**Características:**
- Fundo com cor suave (50)
- Borda colorida (2px)
- Hover com cor mais intensa (100)
- Borda mais escura ao passar o mouse

---

## 🔄 Lógica de Determinação de Cor

```javascript
const hasVacancies = escola.vagas_disponiveis > 0;      // Verde
const isOverCapacity = escola.vagas_disponiveis < 0;    // Vermelho
// Caso contrário: Amarelo (vagas === 0)

// Aplicação
isOverCapacity ? "bg-red-50" : hasVacancies ? "bg-green-50" : "bg-yellow-50"
```

---

## 📊 Exemplos Visuais

### Exemplo 1: Escola com Vagas (Verde)
```
┌──────────────────────────────────────────────────────────────┐
│ 🟢 EMEF PROF° JOSÉ FLÁVIO ALVES DE LIMA                      │
│    URBANA • 34 turmas                                        │
│                                                              │
│    Matrículas: 959    Capacidade: 970    Vagas: 11          │
│    ████████████████░░ 99%                 ✓ Vagas           │
└──────────────────────────────────────────────────────────────┘
```

### Exemplo 2: Escola Completa (Amarelo)
```
┌──────────────────────────────────────────────────────────────┐
│ 🟡 EMEF CRISTO REI                                           │
│    URBANA • 29 turmas                                        │
│                                                              │
│    Matrículas: 883    Capacidade: 917    Vagas: 34          │
│    ████████████████░░ 96%                 ✓ Cheia           │
└──────────────────────────────────────────────────────────────┘
```

### Exemplo 3: Escola Lotada (Vermelho)
```
┌──────────────────────────────────────────────────────────────┐
│ 🔴 EMEF PROF.ª MARIA ILAN RODRIGUES JADÃO                    │
│    URBANA • 28 turmas                                        │
│                                                              │
│    Matrículas: 871    Capacidade: 865    Vagas: +6 acima    │
│    ██████████████████ 101%                ⚠ Lotada          │
└──────────────────────────────────────────────────────────────┘
```

---

## 🎯 Benefícios

✅ **Identificação Rápida:** Cores permitem identificar status de um relance
✅ **Hierarquia Visual:** Prioriza escolas lotadas (vermelho) visualmente
✅ **Consistência:** Mesmas cores em desktop e mobile
✅ **Acessibilidade:** Cores com contraste adequado
✅ **Interatividade:** Hover feedback com cores mais intensas
✅ **Profissionalismo:** Interface moderna e intuitiva

---

## 🔧 Personalização

### Mudar Cores

**Arquivo:** `frontend/src/components/EscolasTable.js`

**Desktop (linhas 130-140):**
```javascript
className={`cursor-pointer transition-all duration-200 ${
  isSelected
    ? "bg-violet-100 border-l-4 border-l-violet-500"
    : isOverCapacity
      ? "bg-red-50 hover:bg-red-100 border-l-4 border-l-red-400"      // Mudar aqui
      : hasVacancies
        ? "bg-green-50 hover:bg-green-100 border-l-4 border-l-green-400"  // Ou aqui
        : "bg-yellow-50 hover:bg-yellow-100 border-l-4 border-l-yellow-400"  // Ou aqui
}`}
```

**Mobile (linhas 240-248):**
```javascript
className={`rounded-lg border-2 p-3 cursor-pointer transition-all duration-200 ${
  isSelected
    ? "border-violet-500 bg-violet-50"
    : isOverCapacity
      ? "bg-red-50 border-red-300 hover:border-red-400 hover:bg-red-100"      // Mudar aqui
      : hasVacancies
        ? "bg-green-50 border-green-300 hover:border-green-400 hover:bg-green-100"  // Ou aqui
        : "bg-yellow-50 border-yellow-300 hover:border-yellow-400 hover:bg-yellow-100"  // Ou aqui
}`}
```

### Cores Tailwind Disponíveis

- **Vermelhos:** red-50, red-100, red-200, red-300, red-400, red-500, ...
- **Verdes:** green-50, green-100, green-200, green-300, green-400, green-500, ...
- **Amarelos:** yellow-50, yellow-100, yellow-200, yellow-300, yellow-400, yellow-500, ...
- **Azuis:** blue-50, blue-100, blue-200, blue-300, blue-400, blue-500, ...

---

## 📋 Testes Recomendados

### Teste 1: Cores Corretas
1. Abra o dashboard
2. Procure por escolas com diferentes status
3. Verifique se as cores estão corretas:
   - Verde para vagas
   - Amarelo para completa
   - Vermelho para lotada

### Teste 2: Hover Effect
1. Passe o mouse sobre cada linha
2. Verifique se a cor fica mais intensa
3. Verifique se a transição é suave

### Teste 3: Seleção
1. Clique em uma escola
2. Verifique se muda para roxo (selecionada)
3. Clique em outra para desselecionar

### Teste 4: Mobile
1. Abra em mobile
2. Verifique se as cores são aplicadas aos cards
3. Verifique se o hover funciona
4. Verifique responsividade

### Teste 5: Acessibilidade
1. Verifique contraste de cores
2. Teste com ferramenta de contraste (WCAG)
3. Verifique se legível para daltônicos

---

## 📝 Notas Técnicas

### Transições
- Duração: 200ms
- Tipo: Suave (default)
- Propriedades: background-color, border-color

### Borda Esquerda
- Largura: 4px (desktop), 2px (mobile)
- Posição: Esquerda
- Cor: Correspondente ao status

### Hover
- Desktop: Cor de fundo mais intensa
- Mobile: Borda mais escura + fundo mais intenso

---

## 🚀 Próximas Melhorias

1. **Animação ao Carregar**
   - Fade-in com cor do status
   - Transição suave ao aparecer

2. **Ícone Indicador**
   - Ícone na borda esquerda
   - Indica status visualmente

3. **Tooltip com Detalhes**
   - Ao passar o mouse, mostra detalhes
   - Exemplo: "6 alunos acima da capacidade"

4. **Filtro por Cor**
   - Filtrar apenas escolas com vagas
   - Filtrar apenas escolas lotadas

5. **Exportação com Cores**
   - Manter cores em PDF/Excel
   - Facilitar análise visual

---

## 📄 Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `frontend/src/components/EscolasTable.js` | Aplicado cores em toda a linha (desktop e mobile) |

---

**Fim da Documentação**
