## Objetivo

Trocar o modelo de tratamento de fotos em `enhance-listing-images` de `google/gemini-2.5-flash-image` para o modelo de imagem da OpenAI via Lovable AI Gateway (`openai/gpt-image-2`), que tende a respeitar melhor instruções de aspect ratio e outpainting — resolvendo de vez o problema das faixas brancas.

## Mudanças

### `supabase/functions/enhance-listing-images/index.ts`

1. **Trocar endpoint e modelo**: sair de `/v1/chat/completions` com `google/gemini-2.5-flash-image` para `/v1/images/edits` (ou `/v1/images/generations` com input image, conforme spec do gateway) usando `openai/gpt-image-2`.
2. **Ajustar payload**: OpenAI image edit aceita `image` (arquivo/base64), `prompt`, `size` (usar `1536x1024` — o tamanho horizontal nativo suportado, aproximadamente 3:2, mais próximo do 16:9 desejado) e `quality: "low"` (padrão recomendado para reduzir custo/latência).
3. **Simplificar pipeline**: como o gpt-image-2 respeita o `size` solicitado, remover a lógica pesada de `toHorizontalCanvas` com espelhamento/blur — enviar a imagem original direto com `size: "1536x1024"` e prompt pedindo outpainting horizontal realista.
4. **Manter validação pós-geração**: continuar checando dimensões via header PNG e, se sair fora de ~3:2, aplicar `toHorizontalCanvas` como fallback de segurança (mantém a função `toHorizontalCanvas` no arquivo, mas só é usada em caso de desvio).
5. **Manter detecção de faixas brancas + retry** com prompt reforçado (1 retry).
6. **Manter limite de 2 imagens por invocação** e o resto do fluxo (upload storage, update DB, `processing_logs`).
7. **Manter o mesmo prompt em português** pedindo extensão realista do ambiente sem faixas brancas.

### Frontend
Sem alterações — o frontend já chama a função em lotes de 2 e não conhece o modelo.

### Deploy
Redeploy da função `enhance-listing-images`. Testar clicando em "Tratar fotos com IA" em um anúncio existente.

## Observação sobre custo

`openai/gpt-image-2` custa mais que `gemini-2.5-flash-image` por imagem. Se o custo virar problema, dá para voltar ou usar `openai/gpt-image-1-mini` como alternativa mais barata.
