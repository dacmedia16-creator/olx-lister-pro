## Diagnóstico

Ao inspecionar o anúncio `0adfa05f...` (Sorocaba, ID `1486041563`), as 9 fotos salvas vieram da rota de **fallback PLP**, não do PDP real. O log confirma: quando o PDP da GeckoAPI retorna `images: []`, o código busca a página de categoria (PLP) e, se não consegue casar o anúncio pelo ID/URL, usa `ads[0]` — ou seja, **o primeiro anúncio qualquer daquela categoria**. Por isso aparecem fotos de outros imóveis.

Dois pontos do código causam isso:

1. `supabase/functions/import-olx-listing/index.ts:115` — `const target = matched ?? ads[0];` (fallback cego para o primeiro item).
2. `supabase/functions/_shared/gecko.ts` — `collectDeepImageUrls` varre a resposta PDP inteira, então pode capturar imagens de "anúncios similares/recomendados" embutidas no JSON, misturando com as do próprio anúncio.

## Correção proposta

**1) Fallback PLP só quando houver match confirmado**
- Em `fetchPlpFallbackImages`: retornar `[]` se `matched` for falso. Sem `ads[0]`.
- Registrar em `processing_logs` `plp_fallback.matched=false` com aviso "sem match, imagens ignoradas".

**2) Reduzir escopo do deep scan do PDP**
- No `extractPdpImageDiagnostics`, varrer só a subárvore do próprio anúncio: `gecko.data.data` (ou `gecko.data` quando não há aninhamento), **excluindo** chaves conhecidas de listas paralelas (`related`, `similar`, `suggestions`, `recommendations`, `otherAds`, `items`, `ads`).
- Preferir sempre `fieldImages` (campos oficiais `images/photos/media/gallery`). Só usar `deepImages` como complemento se `fieldImages.length === 0`.

**3) Rastreabilidade na UI**
- Persistir a origem das fotos por anúncio: adicionar coluna `images_source text` em `olx_listings` (valores: `pdp`, `pdp_retry`, `plp_fallback`, `none`).
- Em `listings.$id.tsx`, mostrar um badge discreto quando `images_source !== 'pdp'`, informando: "Fotos obtidas via busca da categoria (podem estar desatualizadas)" — e quando `none`, o card já existente de "sem fotos" continua.

**4) Limpar registros contaminados**
- Migração one-shot: apagar linhas de `listing_images` de anúncios cujo último log indica `image_source in ('plp_fallback')` com `matched=false`, para que a próxima reimportação traga o estado correto (ou vazio, se o PDP não fornecer imagens).

## Resultado esperado

- Se o PDP tiver fotos → aparecem exatamente essas.
- Se o PDP não tiver fotos e o PLP casar o anúncio pelo ID/URL → usamos as thumbs do próprio anúncio (com badge de origem).
- Se nada casar → mostramos "sem fotos" em vez de fotos de outro imóvel.

## Fora do escopo

- Não vamos tentar scrapear o site da OLX diretamente — o app usa apenas a GeckoAPI conforme combinado.
