Alterar o prompt fixo usado pela Edge Function `enhance-listing-images` para:

> "Melhore a imagem sem mudar o ambiente, deixe na Vertical."

## Mudanças

1. `supabase/functions/enhance-listing-images/index.ts`
   - Trocar constante `PROMPT` de "…deixe na horizontal." para "…deixe na Vertical."
2. Redeploy da função `enhance-listing-images`.

Nenhuma mudança de UI, banco ou fluxo. Fotos já tratadas anteriormente permanecem como estão; novas execuções (botão "Tratar fotos com IA") passarão a usar o novo prompt.