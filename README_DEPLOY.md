# Deploy na Render — dashboard-v1

Este repositório já está pronto para deploy como **Static Site** na Render.

## Como publicar (via Blueprint)
1. Faça push deste repo no GitHub.
2. Na Render, vá em **Blueprints** → **New from repo** e selecione este repositório.
3. A Render vai ler `render.yaml` e criar um serviço **static** com:
   - Root Directory: `frontend`
   - Build Command: `npm ci && npm run build`
   - Publish Directory: `build`

## Variáveis de Ambiente (Frontend)
No serviço Static (Render → Settings → Environment), adicione:
```
REACT_APP_API_URL=https://SEU-BACKEND.onrender.com/api
```
> Substitua pela URL do seu backend. O frontend usa `src/components/api.js` para ler essa variável.

## CORS no Backend
No backend (Express), habilite CORS permitindo o domínio da Render do static, por ex.:
```ts
import cors from 'cors';
const allowed = ['https://SEU-STATIC.onrender.com', 'http://localhost:3000'];
app.use(cors({ origin: allowed, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'], credentials: true, maxAge: 86400 }));
app.options('*', cors());
```

## Desenvolvimento local
```
cd frontend
cp .env.example .env      # defina REACT_APP_API_URL
npm install
npm run start
```

## SPA / Rotas
Já existe `public/_redirects` com fallback:
```
/*    /index.html   200
```
