# Usar sua própria OpenAI API Key para tratar fotos

Com sua chave OpenAI própria, chamamos direto a API oficial da OpenAI (`https://api.openai.com/v1/images/edits`) e conseguimos **editar a foto preservando o ambiente** — que é o que o Lovable AI Gateway não permite.

## O que você precisa fazer (1 passo manual)

1. Ir em https://platform.openai.com/api-keys
2. Clicar em **"Create new secret key"** → copiar (começa com `sk-...`)
3. Ter créditos ativos na conta OpenAI (Settings → Billing)
4. Me mandar "ok" — vou pedir a chave via formulário seguro (`OPENAI_API_KEY`), você cola e salva.

**Importante:** o modelo `gpt-image-1` (edição real) exige que sua organização OpenAI esteja **verificada** (Settings → Organization → Verify). Sem verificação, retorna 403.

## O que vou implementar

Reescrever a Edge Function `enhance-listing-images` para:

1. Ler `OPENAI_API_KEY` (secret) em vez de `LOVABLE_API_KEY`.
2. Chamar direto `POST https://api.openai.com/v1/images/edits` com:
   - `model: "gpt-image-1"`
   - `image`: foto original (multipart)
   - `prompt`: "Melhore nitidez, iluminação e cor. NÃO altere o ambiente, móveis ou layout. Preserve 100% da cena original."
   - `size: "1536x1024"` (horizontal 3:2 nativo — sem precisar de canvas)
   - `n: 1`
3. Salvar resultado no bucket `olx-images` (fluxo atual mantido).
4. Manter:
   - Limite de 2 imagens por chamada (evita CPU timeout).
   - Processamento em lote no frontend com contador.
   - Validação de aspect ratio + retry se sair fora do 3:2.
   - Logs em `processing_logs`.
5. Remover o `toHorizontalCanvas` (não precisa mais — OpenAI entrega horizontal nativo).

## Tratamento de erros

- `401` → chave inválida, aviso claro no toast.
- `403 organization must be verified` → toast explicando o passo de verificação.
- `429` → rate limit, sugere retry.
- `400 billing_hard_limit_reached` → sem créditos na OpenAI.

## O que NÃO muda

- Frontend (botões, ZIP, toggle original/tratada, download).
- Banco de dados.
- Fluxo de importação OLX.
- Nenhuma outra Edge Function.

## Custo (referência OpenAI, não Lovable)

`gpt-image-1` em `1536x1024` custa ~$0.04-0.19 por imagem dependendo da qualidade. Vai debitar da sua conta OpenAI direto, **não** dos créditos Lovable.

---

**Confirma?** Se sim, respondo pedindo a `OPENAI_API_KEY` via formulário seguro e já implemento.