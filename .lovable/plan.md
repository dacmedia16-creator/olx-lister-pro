## Aumentar limite de fotos por anúncio para 20

### O que mudar
O limite atual de 10 fotos por anúncio está hardcoded em 3 pontos do arquivo `supabase/functions/_shared/gecko.ts`:

1. `collect()` — linha 60: `out.slice(0, 10)` → `out.slice(0, 20)`
2. `collectDeepImageUrls()` — linha 135: `out.slice(0, 10)` → `out.slice(0, 20)`
3. `mergeUrls()` — linha 150: `out.slice(0, 10)` → `out.slice(0, 20)`

### Impacto
- A Edge Function `import-olx-listing` passará a extrair e persistir até 20 URLs de imagem por anúncio.
- O deep scan continua parando antecipadamente em 20 itens (`out.length >= 20`), então a performance não muda.
- Nenhuma alteração de schema ou frontend é necessária — o campo `image_urls` já aceita arrays de qualquer tamanho.

### Deploy
Após a edição, re-deploy das Edge Functions afetadas.