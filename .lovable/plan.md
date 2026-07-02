# Adicionar indicadores de fotos tratadas por IA

## Objetivo
Mostrar visualmente, fora da tela de detalhes, quais anúncios/lotes já têm fotos tratadas pela IA, com um contador `X/Y tratadas`.

## Mudanças

### 1. Listagem de anúncios importados (`src/routes/_authenticated/listings.index.tsx`)
- Na query que já busca `olx_listings`, incluir contagem agregada de `listing_images` total e de `listing_images` com `enhanced_url` (ou flag equivalente já existente).
- Em cada card:
  - Badge "IA" no canto superior esquerdo da thumbnail quando houver ao menos 1 foto tratada.
  - Chip discreto com contador `N/T tratadas` no rodapé do card, ao lado da contagem de fotos.

### 2. Listagem de lotes de tratamento (`src/routes/_authenticated/tools.enhance.index.tsx`)
- Na query de `photo_batches`, agregar contagem total de `photo_batch_images` e quantas têm `enhanced_url`.
- Em cada card do lote:
  - Badge "IA" quando o lote tem ao menos 1 foto tratada.
  - Contador `N/T tratadas` no rodapé.
  - Se `N === T`, usar variante "sucesso" (verde) no badge para indicar lote completo.

## Detalhes técnicos
- Reaproveitar o mesmo componente visual de badge já usado na tela de detalhes (mesmo texto "IA", mesmas cores) para consistência.
- Contagens feitas via `select` com `count` embutido do PostgREST (`listing_images(count)`) filtrando por `enhanced_url not null`, evitando N+1.
- Nenhuma mudança em edge functions, banco ou lógica de processamento — apenas leitura e apresentação.
