## Problema

Ao clicar em "Tratar" numa foto individual, a Edge Function `enhance-listing-images` está falhando com:

```
error sending request for url (https://deno.land/x/imagescript@1.2.17/utils/wasm/zlib.wasm):
Connection refused (os error 111)
```

A função depende do `imagescript` (usado no fallback `toHorizontalCanvas` para gerar a imagem 3:2 com bordas espelhadas). O `imagescript` baixa um arquivo `.wasm` remoto do `deno.land/x` em runtime, e o ambiente da Edge Function está bloqueando/recusando essa conexão — então qualquer chamada quebra antes mesmo de processar a imagem.

## Correção

1. **Remover a dependência do `deno.land/x/imagescript`** em `supabase/functions/enhance-listing-images/index.ts` e no fallback compartilhado.
2. **Substituir por `@jsquash/png` + `@jsquash/jpeg` + `@jsquash/resize`** (via `esm.sh`), que empacotam o WASM inline (base64) e não fazem fetch remoto em runtime — funcionam bem em Edge Functions Deno.
   - Alternativa mais simples: usar `https://esm.sh/imagescript@1.2.17` (a build ESM já inlina o wasm em muitos casos) e, se ainda falhar, migrar para `@jsquash`.
3. Reimplementar `toHorizontalCanvas` (canvas 1536x1024, edge-mirror blur nas laterais) usando a nova lib, mantendo a mesma assinatura para não impactar o resto do fluxo.
4. Manter intactos: chamada OpenAI `/v1/images/edits` com `gpt-image-1`, validação de aspect ratio 3:2, detecção de faixas brancas + retry, upload no bucket `olx-images`, logs em `processing_logs`.
5. Limpar as imagens que ficaram travadas em `status = 'processing'` para permitir reprocessar.
6. Redeploy da função e teste do botão "Tratar" individual na tela de detalhes.

## Detalhes técnicos

- Arquivos a alterar: `supabase/functions/enhance-listing-images/index.ts` (e helper de canvas, se estiver em `_shared/`).
- SQL de limpeza: `UPDATE listing_images SET enhancement_status = 'pending' WHERE enhancement_status = 'processing';`
- Nenhuma mudança no frontend nem no schema do banco.

## Validação

- Deploy da função `enhance-listing-images`.
- Clicar em "Tratar" numa foto individual na tela de detalhes.
- Conferir logs: sem erro de wasm, resposta 200, imagem tratada salva em 3:2.
