## Problema

Ao clicar em "Tratar fotos com IA", a Edge Function retorna erro non-2xx. Logs mostram `CPU Time exceeded` — a função processa todas as fotos (10+) em série, e cada uma faz decode + resize + encode + validação com `imagescript` mais chamada Gemini. Isso estoura o limite de CPU do runtime da Edge Function.

## Solução

### 1. Backend (`enhance-listing-images/index.ts`)
- Aceitar `image_ids` (já aceita) e adicionar limite máximo de **2 imagens por invocação** (`MAX_PER_CALL = 2`). Se vierem mais, processa só as 2 primeiras e devolve `remaining_ids` no JSON de resposta.
- Trocar a **validação de ratio pós-Gemini**: em vez de `decodeImage` completo (custa CPU alto), ler apenas o header PNG (bytes 16–24 = width/height big-endian) para pegar dimensões. Só chama `toHorizontalCanvas` de correção se estiver fora da tolerância — mantendo a garantia 16:9.
- Manter o pipeline: download → letterbox horizontal → Gemini → validação header → (opcional) recanvas → upload.

### 2. Frontend (`src/routes/_authenticated/listings.$id.tsx`)
- Reescrever a função `enhance()` para:
  1. Buscar IDs das imagens do anúncio ainda não tratadas (ou todas se for retratamento).
  2. Chamar `enhance-listing-images` em loop, passando `image_ids` em lotes de 2, até esgotar.
  3. Após cada lote, dar `await load()` para o usuário ver o progresso ("3/10 tratadas…" via toast atualizado ou contador simples).
  4. No fim, toast com total de sucesso/falha.
- Botão passa a mostrar "Tratando X/Y…" enquanto processa.

### Fora do escopo
- Não muda o prompt, o modelo Gemini, nem a lógica de letterbox de entrada.
- Não altera `listings.index.tsx` (a página de detalhes é a única que dispara enhancement).
- Não persiste fila em tabela — o loop vive no cliente enquanto a página está aberta (mesmo padrão do polling atual de importação).

### Deploy
- Redeploy da função `enhance-listing-images`.
