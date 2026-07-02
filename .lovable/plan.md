## Objetivo
Adicionar seletor de qualidade (**Baixa** US$ 0,02/foto ou **Média** US$ 0,07/foto) em todos os fluxos de tratamento por IA, com custo estimado atualizado em tempo real na confirmação.

## Backend — `supabase/functions/enhance-listing-images/index.ts`

1. Aceitar novo parâmetro `quality: "low" | "medium"` (default `"low"` para retrocompatibilidade) no payload.
2. Repassar `quality` para a chamada do `gpt-image-1` da OpenAI (hoje fixo em `"low"`).
3. Aplicar tanto no modo `enhance` quanto no `watermark_only`.
4. Persistir a qualidade escolhida em `photo_batches` e/ou `listing_images` (nova coluna `enhance_quality text`) para exibir no histórico e permitir reprocessar com a mesma qualidade.

## Banco — migração
- Adicionar coluna `enhance_quality text default 'low'` em `photo_batches` e `listing_images` (ou `photo_batch_images`).

## Frontend

Componente novo `src/components/QualityPicker.tsx` (RadioGroup) reutilizado em todos os pontos:
- **Baixa** — US$ 0,02/foto — rápida, pode deformar linhas retas
- **Média** — US$ 0,07/foto — geometria preservada, ~3,5× mais cara

Locais que ganham o seletor + cálculo dinâmico no diálogo de confirmação:

1. `src/routes/_authenticated/tools.enhance.new.tsx` — escolha antes de criar o lote.
2. `src/routes/_authenticated/tools.enhance.$id.tsx` — seletor no botão "Retratar lote" e nas ações por foto (Tratar/Retratar/Marca).
3. `src/routes/_authenticated/listings.$id.tsx` — seletor nos AlertDialogs de:
   - Tratar todas / Retratar todas
   - Remover marca d'água em lote
   - Ações individuais por foto (Tratar, Marca)

O custo estimado no diálogo passa a ser `nºfotos × (0.02 | 0.07)` conforme a escolha.

## Fora de escopo
- Qualidade `high` (US$ 0,19) — pode entrar depois se pedido.
- Cobrança/limite por usuário.
- Alteração dos prompts atuais.
