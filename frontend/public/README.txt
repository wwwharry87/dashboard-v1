PWA Icon Pack (Android + iOS)

1) Copie a pasta 'icons' para o seu /public/icons (ou crie essa pasta e coloque os pngs lá).
2) Atualize o public/manifest.json para apontar para:
   - /icons/icon-192x192.png?v=2
   - /icons/icon-512x512.png?v=2
   (o ?v=2 ajuda a forçar atualização do cache em instalações existentes)

3) Atualize o public/index.html para iOS:
   <link rel="apple-touch-icon" href="%PUBLIC_URL%/icons/icon-180x180.png?v=2" />
   <link rel="icon" href="%PUBLIC_URL%/favicon.ico?v=2" />

4) Se você usa Service Worker que faz cache de assets, mude a versão do cache (CACHE_VERSION)
   ou o nome do cache para forçar baixar os novos arquivos.

Observações:
- Para o ícone aparecer na 'tela inicial', o usuário precisa ter instalado/adicionado o PWA.
- Depois de instalado, o ícone PODE atualizar sozinho, mas no iOS às vezes só atualiza após um tempo,
  ou pode exigir reinstalação. O truque do ?v=2 + novo cache do SW aumenta muito a chance de atualizar.