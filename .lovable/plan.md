
## Objetivo
Corrigir o pipeline de fotos da OLX (PLP + PDP) via GeckoAPI: diagnosticar onde as URLs realmente vêm, enriquecer PLP com PDP quando as fotos vierem vazias, parar de baixar imagens pro storage e usar as URLs originais no `<img>` com fallback em `onError`.

## Diagnóstico (passo 1 da execução)
Antes de mexer no código, rodar chamadas de teste na GeckoAPI direto do sandbox (server-side, token em env) e logar:
- **PLP**: `POST /v1/extract` com `{target:"olx.com.br", type:"plp", state:"SP", categoryPath:"imoveis", page:1}`. Imprimir, para os 3 primeiros `data.items[]`: `keys(item)`, `item.images`, `item.thumbnails`, `item.photos`, `item.media`, `item.thumbnail`, `item.image`.
- **PDP**: pegar `items[0].url` e chamar `{target:"olx.com.br", type:"pdp", url}`. Imprimir `keys(data.data)`, `data.data.images`, `data.data.photos`, `data.data.media`, e as 3 primeiras URLs cruas.
- Anexar esse dump como comentário no PR e como `processing_logs` row (`type:"debug"`) pra referência futura.

Isso valida o formato real antes de qualquer refactor.

## Mudança de arquitetura: URLs originais, sem download
O usuário pediu explicitamente para NÃO baixar as fotos pro storage. Consequências:
- `import-olx-listing`: remover `fetch(imgUrl)` + `admin.storage.upload`. Só persistir `original_external_url` em `listing_images` com `status='ready'`.
- `listings.$id.tsx`: parar de gerar signed URLs; renderizar `original_external_url` direto.
- Bucket `olx-images` fica intacto (para o feature futuro de AI enhance), mas não é mais usado no fluxo padrão.

## Backend

### `supabase/functions/_shared/gecko.ts` (novo)
Helper compartilhado:
- `callGecko(payload, {retries:2})` — POST em `GECKO_ENDPOINT` com `Authorization: Bearer ${GECKO_API_KEY}`, timeout 30s.
- Retry com backoff (1.5s, 3s) em `429/502/503/504` e em falha de rede.
- Loga status HTTP + `requestId` de cada tentativa (`console.log` pra Edge logs).
- `extractPlpImages(item)` e `extractPdpImages(root)` — leem `images/photos/media/thumbnails` e o singular `thumbnail/image`, retornando `string[]` normalizado (ver seção "Normalização").

### `search-olx-listings`
- Trocar chamada inline por `callGecko`.
- Após mapear `items[]`, para cada um dos **top 5** cuja lista de imagens tiver `< 3` fotos, disparar PDP `{type:"pdp", url: item.url}` em paralelo (`Promise.allSettled`, concorrência 3) e mesclar imagens PDP com dedupe.
- Salvar `image_urls text[]` na `olx_search_results` (nova coluna) e continuar preenchendo `main_image_url` (primeiro item da lista final).
- Log `processing_logs` com contagens: `{plp_images, pdp_enriched, final_count}`.

### `import-olx-listing`
- Trocar `fetch` inline por `callGecko` (com retry).
- Após PDP, se `extractPdpImages` devolver `< 3`, tentar novamente uma vez (a PDP às vezes preenche em segunda chamada). Se ainda vazio, log warning e seguir.
- **Remover download pro storage**. Inserir uma linha em `listing_images` por URL só com `original_external_url`, `position`, `status='ready'`.
- Preservar imagens antigas se novas vierem vazias (comportamento atual).

### Normalização de URLs (compartilhada)
- Aceitar shapes: `string`, `{url}`, `{original}`, `{src}`, `{href}`, `{originalUrl}`, `{large}`, `{medium}`, `{small}` (usar a maior disponível quando objeto tiver várias variações).
- Filtrar `null/undefined/""`.
- `//foo` → `https://foo`; `http://` → `https://`.
- Dedupe por URL final.
- Limitar a **10 fotos** por anúncio.

### Migration
```sql
ALTER TABLE public.olx_search_results
  ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}'::text[];
```
Sem novos GRANTs (tabela já tem).

## Frontend

### `src/components/OlxImageCarousel.tsx` (novo)
- Props: `urls: string[]`, `alt?: string`, `className?: string`.
- Estado local `activeIdx` + `deadIdx: Set<number>`.
- Renderiza `<img src={urls[activeIdx]} referrerPolicy="no-referrer" loading="lazy" onError={() => marcar dead e avançar}>`.
- Se todas mortas → placeholder "sem foto".
- Setas prev/next (só se `urls.length > 1`) e bullets no rodapé.
- Sem libs externas — puro React + Tailwind, ícones `ChevronLeft/Right` do lucide.

### `src/routes/_authenticated/search.tsx`
- Trocar `<img src={r.main_image_url}>` pelo carrossel consumindo `r.image_urls` (fallback para `[main_image_url]` quando array vazio).
- Adicionar `image_urls: string[] | null` ao tipo `ResultRow`.

### `src/routes/_authenticated/listings.$id.tsx`
- Remover `createSignedUrls`. Ler `original_external_url` direto de `listing_images`.
- Bloco de fotos: usar `OlxImageCarousel` no topo com todas as URLs; grid de miniaturas embaixo (opcional, mantém layout atual mas trocando `im.url` por `im.original_external_url`).
- Botão "Reimportar" continua igual.

### `src/routes/_authenticated/listings.index.tsx`
- Se card usa signed URL, trocar para `original_external_url` direto.

## Observabilidade
- Todas as chamadas GeckoAPI logam em `console.log` (aparecem em `edge_function_logs`): `{type, status, requestId, retries, ms}`.
- Em caso de 0 imagens após PDP enrichment, `processing_logs` recebe `type:'image', status:'warning'` com `{plp_count, pdp_count, url}`.

## Segurança / limites
- Token `GECKO_API_KEY` continua só em env server-side (já está).
- Concorrência de PDP enrichment fixa em 3 pra não estourar rate limit.
- Máx 5 items enriquecidos por busca (evitar surpresa de créditos).

## Validação
1. Rodar teste PLP + PDP e postar dump JSON dos campos de imagem no chat.
2. Executar uma busca real via UI `/search` (categoria `imoveis`, UF `SP`), confirmar via logs que `pdp_enriched > 0` e que os cards mostram carrossel.
3. Importar um anúncio via `/import`, abrir detalhes e confirmar carrossel com múltiplas fotos + fallback funcionando (simular URL quebrada no devtools).

## Arquivos tocados
- **novo**: `supabase/functions/_shared/gecko.ts`, `src/components/OlxImageCarousel.tsx`
- **editados**: `supabase/functions/search-olx-listings/index.ts`, `supabase/functions/import-olx-listing/index.ts`, `src/routes/_authenticated/search.tsx`, `src/routes/_authenticated/listings.$id.tsx`, `src/routes/_authenticated/listings.index.tsx`
- **migration**: `image_urls text[]` em `olx_search_results`
