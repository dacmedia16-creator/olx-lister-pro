## Resumo
Aumentar o limite máximo de fotos importadas por anúncio OLX de 20 para 40.

## O que será alterado
- `supabase/functions/_shared/gecko.ts` — 3 locais onde o limite está hardcoded como `20`:
  1. `collect()` — `return out.slice(0, 20);`
  2. `collectDeepImageUrls()` — `if (out.length >= 20 ...)` e `return out.slice(0, 20);`
  3. `mergeUrls()` — `return out.slice(0, 20);`

## Passo a passo
1. Substituir todos os `slice(0, 20)` e `>= 20` por `40` no `gecko.ts`.
2. Fazer deploy das Edge Functions afetadas (`import-olx-listing` e `search-olx-listings`) para aplicar a mudança.

## Resultado esperado
Próximas importações (por link ou busca) passarão a trazer até 40 fotos por anúncio.