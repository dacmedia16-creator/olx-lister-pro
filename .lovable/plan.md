## Objetivo
Adicionar um botão de "tratar com IA" em cada foto individualmente na tela de detalhes do anúncio, além do botão em lote já existente.

## Mudanças

**Arquivo:** `src/routes/_authenticated/listings.$id.tsx`

1. Criar novo estado `enhancingIds: Set<string>` para rastrear quais imagens estão sendo tratadas individualmente.
2. Criar função `enhanceOne(imageId)` que:
   - Adiciona o ID ao set `enhancingIds`.
   - Chama `enhance-listing-images` com `{ listing_id: id, image_ids: [imageId] }`.
   - Recarrega dados via `load()`.
   - Mostra toast de sucesso/erro.
   - Remove o ID do set no `finally`.
3. No grid de miniaturas (linhas 348-394), adicionar em cada card:
   - Botão sobre a imagem (canto superior direito) com ícone `Sparkles`:
     - Texto/tooltip: "Tratar" (ou "Retratar" se `isEnhanced`).
     - Desabilitado se `enhancingIds.has(im.id)`, `enhancing` (batch), ou sem `original_external_url`.
     - Mostra spinner quando processando.
   - Aparece no hover (`opacity-0 group-hover:opacity-100`), similar ao botão de download.
4. Se `im.enhancement_status === "processing"`, manter o overlay atual "tratando…".

## Comportamento
- Batch (botão do topo) continua funcionando igual.
- Individual permite retratar apenas 1 foto específica sem re-processar todas — útil para corrigir uma foto que ficou ruim.
- Nada muda na Edge Function `enhance-listing-images` (ela já aceita `image_ids`).
