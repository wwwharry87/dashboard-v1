# Dashboard v1 - Refatoracao (UI/UX + Performance)

Este ZIP ja vem com as melhorias aplicadas.

## O que mudou (resumo)

### Frontend (alterado)
- **Utils**: `frontend/src/utils/formatters.js` centraliza `formatNumber`, `formatPercent`, `formatCPF` com tratamento robusto e JSDoc.
- **Componentes comuns**: `frontend/src/components/common/` com `Button`, `Input`, `Modal` (Framer Motion), `Table` (useMemo + responsivo) e `Toast`.
- **Hooks**: `frontend/src/hooks/` com `useDebounce`, `useFetch` (cache + abort) e `useDarkMode` (persistencia em localStorage).
- **Contexto global**: `frontend/src/context/AppContext.js` + hook `useApp()` para usuario/loading/notificacoes.
- **Design system**: `frontend/tailwind.config.js` com paleta profissional e `darkMode: 'class'` + `frontend/src/index.css` com `@layer`.
- **Exportacao Excel/PDF**: corrigido o problema do `autoTable` (ESM) e compatibilizado import do `xlsx`.

### Backend
- **Nao alterado**.

## Como rodar (passo a passo)

1. Entre na pasta do frontend:
   ```bash
   cd dashboard-v1-main/frontend
   ```
2. Instale dependencias:
   ```bash
   npm install
   ```
3. Rode o projeto:
   ```bash
   npm start
   ```

> Observacao: incluimos `tailwindcss`, `postcss` e `autoprefixer` em `devDependencies` para garantir que o Tailwind funcione em qualquer maquina.

## Exemplos de uso (rapido)

### 1) Formatters
```js
import { formatNumber, formatPercent, formatCPF } from '../utils/formatters';

formatNumber(123456); // "123.456"
formatPercent(12.3456); // "12,35"
formatCPF('12345678909'); // "123.456.789-09"
```

### 2) Toast (notificacoes)
```js
import { useApp } from '../context/AppContext';

const { notify } = useApp();
notify({ type: 'success', title: 'Salvo', message: 'Registro salvo com sucesso!' });
```

### 3) Modal
```jsx
import Modal from '../components/common/Modal';

<Modal open={open} onClose={() => setOpen(false)} title="Detalhes">
  <div>Conteudo</div>
</Modal>
```

### 4) Button
```jsx
import Button from '../components/common/Button';

<Button variant="primary" size="md">Salvar</Button>
<Button variant="outline" size="sm">Cancelar</Button>
```

### 5) useFetch (com cache)
```js
import { useFetch } from '../hooks/useFetch';

const { data, loading, error, refetch } = useFetch('/api/minha-rota', {
  staleTimeMs: 60_000,
});
```

### 6) Dark mode
```js
import { useDarkMode } from '../hooks/useDarkMode';

const { isDark, toggle } = useDarkMode();
```

## Onde foi corrigida a exportacao
- Arquivo principal: `frontend/src/Dashboard.js`
  - Excel: resolve `XLSX.default` (ESM)
  - PDF: resolve `autoTable` (ESM) chamando a funcao exportada em vez de `doc.autoTable`

