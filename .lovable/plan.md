## Objetivo
Garantir que cada foto tratada custe no máximo ~US$ 0,02, reduzindo o gasto da OpenAI.

## Contexto
Hoje `enhance-listing-images` usa `gpt-image-1` com `quality: "high"` e `size: 1536x1024`, o que custa ~US$ 0,17–0,25 por imagem. Para ficar em ~US$ 0,02 é preciso usar `quality: "low"` (única faixa que bate esse teto no `gpt-image-1`).

## Mudanças

### 1. Edge Function `supabase/functions/enhance-listing-images/index.ts`
- Trocar `form.append("quality", "high")` por `"low"`.
- Definir constante `COST_PER_IMAGE_USD = 0.02` e usar no log de custo (`processing_logs`) para refletir o novo valor.
- Ajustar o prompt: manter pedido de nitidez, mas remover exigências que dependem de `high` (ex.: "ultra-detalhado"), evitando frustração com resultado incompatível com `low`.

### 2. Frontend `src/routes/_authenticated/listings.$id.tsx`
- Atualizar `COST_PER_IMAGE_USD` de `0.19` para `0.02`.
- No `AlertDialog` de confirmação, incluir aviso: "Modo econômico ativo (qualidade baixa, ~US$ 0,02/foto). O resultado pode ter menos nitidez que antes."

## Trade-off explícito ao usuário
`quality: "low"` corta o custo em ~10x, mas reduz a fidelidade. Se depois quiser um meio-termo, dá para subir para `medium` (~US$ 0,04/foto) — só avisar.

## Fora de escopo
- Limite diário por usuário, cache de retratamento e orçamento por conta (posso propor depois se quiser).
