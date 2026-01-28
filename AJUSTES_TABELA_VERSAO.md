# Ajustes na Tabela de Escolas e Sistema de Versionamento

## Data: 28 de Janeiro de 2026

### Resumo das Melhorias

Este documento descreve os ajustes implementados na tabela de escolas e a adição do sistema de versionamento automático.

---

## 1. Melhoria na Coluna "Vagas"

### Problema Original
Quando uma escola estava cheia ou acima da capacidade, a coluna "Vagas" mostrava valores zerados ou negativos, sem indicar claramente quanto a escola estava acima da capacidade.

### Solução Implementada

**Arquivo:** `frontend/src/components/EscolasTable.js`

#### Para Escolas com Vagas Disponíveis
- Mostra o número de vagas normalmente
- Cor verde indicando disponibilidade
- Exemplo: `34` vagas

#### Para Escolas Cheias (0 vagas)
- Mostra `0` vagas
- Cor amarela indicando capacidade total atingida
- Barra de ocupação em 100%

#### Para Escolas Lotadas (acima da capacidade)
- **Novo:** Mostra `+X acima` em vermelho
- Indica claramente quanto a escola ultrapassou a capacidade
- Exemplo: Se tem 871 matrículas e capacidade de 865, mostra `+6 acima`
- Cor vermelha destacando o problema
- Barra de ocupação acima de 100%

### Implementação

```javascript
{isOverCapacity ? (
  <div className="flex flex-col items-center">
    <span className="text-red-600 font-bold">+{formatNumber(Math.abs(escola.vagas_disponiveis))}</span>
    <span className="text-[9px] text-red-500">acima</span>
  </div>
) : (
  formatNumber(escola.vagas_disponiveis) || 0
)}
```

**Aplicado em:**
- Desktop (tabela)
- Mobile (cards)

---

## 2. Status "Lotada"

### Problema Original
O status "Lotada" já existia no código, mas não estava visível ou claro na interface.

### Solução Implementada

**Arquivo:** `frontend/src/components/EscolasTable.js`

#### Status Disponíveis
1. **Com Vagas** (Verde)
   - Escolas com vagas disponíveis
   - Ícone: ✓ (checkmark)
   - Cor: Verde

2. **Cheia** (Amarelo)
   - Escolas com 0 vagas (capacidade total atingida)
   - Ícone: ✓ (checkmark)
   - Cor: Amarelo

3. **Lotada** (Vermelho)
   - Escolas acima da capacidade
   - Ícone: ⚠ (warning)
   - Cor: Vermelho
   - **Novo:** Agora claramente visível e destacado

### Lógica de Detecção

```javascript
function getSchoolStatus(escola) {
  const vagas = Number(escola.vagas_disponiveis);
  if (Number.isFinite(vagas) && vagas < 0) return 'LOTADA';
  if (Number.isFinite(vagas) && vagas > 0) return 'VAGAS';
  return 'CHEIA';
}
```

---

## 3. Sistema de Versionamento Automático

### Arquivo Criado
**`frontend/src/version.js`**

### Formato de Versão
```
v{MAJOR}.{MINOR}.{PATCH}

Exemplo: v0.1.16
```

#### Componentes da Versão

| Componente | Descrição | Quando Incrementar |
|-----------|-----------|-------------------|
| **MAJOR** | Mudanças significativas | Redesign, novas funcionalidades principais |
| **MINOR** | Novas funcionalidades | Novos componentes, melhorias |
| **PATCH** | Correções de bugs | Ajustes pequenos, fixes |

### Versão Inicial
```
v0.1.16
```

Começando em 0.1.16 para refletir o estado atual do projeto após as melhorias.

### Uso no Código

```javascript
import { VERSION } from "./version";

// Obter versão formatada
VERSION.toString()  // "v0.1.16"

// Obter versão com data
VERSION.toStringWithDate()  // "v0.1.16 (28/01/2026)"

// Incrementar versão
VERSION.incrementPatch()  // v0.1.17
VERSION.incrementMinor()  // v0.2.0
VERSION.incrementMajor()  // v1.0.0
```

### Histórico de Versões

O arquivo `version.js` inclui um histórico completo:

```javascript
export const VERSION_HISTORY = [
  {
    version: 'v0.1.16',
    date: '2026-01-28',
    changes: [
      'Adicionado sistema de versionamento automático',
      'Melhorado cálculo de vagas com excesso de capacidade',
      'Adicionado status "Lotada" para escolas acima da capacidade',
      'Melhorado display de vagas negativas (excesso)',
      'Integrado versionamento na interface',
    ],
  },
  // ... mais versões
];
```

---

## 4. Integração da Versão na Interface

### Localização
**Abaixo da data de atualização no header mobile**

### Renderização

```jsx
{formattedUpdateDate && (
  <div className="md:hidden p-2 text-center text-xs bg-violet-100/80 text-gray-700 space-y-1">
    <div>Atualizado: {formattedUpdateDate}</div>
    <div className="text-violet-600 font-semibold">{VERSION.toString()}</div>
  </div>
)}

{!formattedUpdateDate && (
  <div className="md:hidden p-2 text-center text-xs bg-violet-100/80 text-gray-700">
    <div className="text-violet-600 font-semibold">{VERSION.toString()}</div>
  </div>
)}
```

### Aparência
- Fundo: Violet (100/80)
- Texto: Cinza escuro
- Versão: Violet 600 (destaque)
- Tamanho: Extra pequeno (xs)

---

## 5. Processo de Atualização de Versão

### Quando Fazer Build

Sempre que fazer um build para produção:

1. **Identifique o tipo de mudança:**
   - PATCH: Correção de bug → `incrementPatch()`
   - MINOR: Nova funcionalidade → `incrementMinor()`
   - MAJOR: Mudança significativa → `incrementMajor()`

2. **Atualize `version.js`:**
   ```javascript
   export const VERSION = {
     major: 0,
     minor: 1,
     patch: 17,  // Incrementado de 16
     // ...
   };
   ```

3. **Atualize o histórico:**
   ```javascript
   export const VERSION_HISTORY = [
     {
       version: 'v0.1.17',
       date: '2026-01-28',
       changes: [
         'Descrição da mudança 1',
         'Descrição da mudança 2',
       ],
     },
     // ... versões anteriores
   ];
   ```

4. **Faça o build:**
   ```bash
   npm run build
   ```

5. **Deploy:**
   ```bash
   # Deploy para produção
   ```

---

## 6. Exemplos de Uso

### Exemplo 1: Escola com Vagas
```
Escola: EMEF PROF° JOSÉ FLÁVIO ALVES DE LIMA
Matrículas: 959
Capacidade: 970
Vagas: 11
Status: ✓ Vagas (verde)
Ocupação: 99%
```

### Exemplo 2: Escola Cheia
```
Escola: EMEF CRISTO REI
Matrículas: 883
Capacidade: 917
Vagas: 34
Status: ✓ Vagas (verde)
Ocupação: 96%
```

### Exemplo 3: Escola Lotada (Novo)
```
Escola: EMEF PROF.ª MARIA ILAN RODRIGUES JADÃO
Matrículas: 871
Capacidade: 865
Vagas: +6 acima (em vermelho)
Status: ⚠ Lotada (vermelho)
Ocupação: 101%
```

---

## 7. Testes Recomendados

### Teste 1: Verificar Cálculo de Vagas
1. Abra o dashboard
2. Procure por escolas com diferentes status
3. Verifique se o cálculo está correto:
   - Vagas = Capacidade - Matrículas
   - Se Vagas < 0, mostra "+X acima"

### Teste 2: Verificar Status "Lotada"
1. Procure por escolas com vagas negativas
2. Verifique se o status mostra "Lotada" com ícone de aviso
3. Verifique a cor vermelha

### Teste 3: Verificar Versionamento
1. Abra o dashboard no mobile
2. Procure pela versão abaixo da data
3. Verifique se mostra "v0.1.16"
4. Verifique se a formatação está correta

### Teste 4: Verificar em Desktop e Mobile
1. Abra em desktop (não deve mostrar versão)
2. Redimensione para mobile (deve mostrar versão)
3. Verifique responsividade

---

## 8. Próximas Melhorias Sugeridas

1. **Tooltip com Detalhes**
   - Ao passar o mouse, mostrar detalhes da escola
   - Exemplo: "Escola acima da capacidade em 6 alunos"

2. **Alerta Visual**
   - Destacar escolas lotadas com cor de fundo
   - Adicionar ícone de alerta maior

3. **Exportação com Versionamento**
   - Incluir versão nos PDFs/Excels exportados
   - Rastrear qual versão gerou o relatório

4. **Changelog Automático**
   - Gerar changelog automaticamente a partir do git
   - Atualizar versão automaticamente no build

5. **Versionamento no Backend**
   - Sincronizar versão com backend
   - Verificar compatibilidade de versões

---

## 9. Arquivos Modificados

| Arquivo | Mudanças |
|---------|----------|
| `frontend/src/components/EscolasTable.js` | Melhorado cálculo e exibição de vagas |
| `frontend/src/Dashboard.js` | Adicionado import e renderização de versão |
| `frontend/src/version.js` | **Novo arquivo** - Sistema de versionamento |

---

## 10. Resumo de Benefícios

✅ **Melhor Visualização:** Escolas lotadas agora são claramente identificadas
✅ **Informação Clara:** Mostra exatamente quanto a escola ultrapassou a capacidade
✅ **Rastreabilidade:** Versão sempre visível para saber qual build está em uso
✅ **Histórico:** Registro completo de todas as mudanças
✅ **Profissionalismo:** Interface mais polida e informativa

---

**Fim da Documentação**
