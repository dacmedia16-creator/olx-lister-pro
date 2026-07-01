## Problema

O `gpt-image-1` está sendo chamado com `quality: "low"`, o que reduz a resolução interna do modelo e gera desfoque em objetos pequenos (garrafas, panelas, relógio, maçanetas). O prompt atual também não instrui explicitamente a preservar nitidez de itens pequenos.

## Mudança

Em `supabase/functions/enhance-listing-images/index.ts`:

1. Trocar `form.append("quality", "low")` por `form.append("quality", "high")` na chamada `/v1/images/edits`. Isso é o principal responsável pelo desfoque — `low` degrada detalhes finos.

2. Reforçar o prompt para exigir nitidez em todos os objetos da cena:
   - "Preserve nitidez total de TODOS os objetos, inclusive pequenos (garrafas, utensílios, eletrodomésticos, decoração, relógios, maçanetas, interruptores). Nenhum item pode ficar desfocado, borrado ou com contornos suavizados."
   - "Não aplique blur, bokeh, profundidade de campo artificial nem suavização de fundo."
   - Manter o restante das regras (fotografia real, sem HDR, horizontal 3:2, outpainting sem faixas).

Nenhuma mudança em UI, banco, fluxo em lote/individual ou modelo.

## Trade-off

`quality: "high"` custa mais tokens por imagem na OpenAI e é mais lento. É o custo esperado para eliminar o desfoque — `medium` é uma alternativa intermediária se o custo pesar; posso deixar `high` por padrão.

## Deploy

Redeploy da função `enhance-listing-images`. Retratando a foto (botão "Retratar" individual) já usa o novo prompt e qualidade.
