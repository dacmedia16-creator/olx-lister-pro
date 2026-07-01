# Tratamento de fotos com IA + downloads

## Objetivo
Na tela de detalhes do anúncio, permitir tratar as fotos com IA (Lovable AI Gateway, modelo de edição de imagem) e depois baixá-las individualmente ou em ZIP.

Prompt fixo aplicado a cada foto:
> "Melhore a imagem sem mudar o ambiente, deixe na horizontal."

## Backend

### 1. Storage
- Usar bucket privado existente `olx-images` para salvar as versões tratadas em `enhanced/{listing_id}/{image_id}.png`.

### 2. Coluna já existente
`listing_images` já tem `enhanced_storage_path`, `enhancement_status`, `enhancement_error`. Vamos usá-las (status: `pending` / `processing` / `done` / `failed`).

### 3. Nova Edge Function `enhance-listing-images`
- Input: `{ listing_id, image_ids?: string[] }` (se omitido, processa todas).
- Para cada imagem:
  1. Marca `enhancement_status = 'processing'`.
  2. Baixa a URL original (`original_external_url`) com `referrerPolicy=no-referrer`.
  3. Chama `https://ai.gateway.lovable.dev/v1/chat/completions` com `google/gemini-2.5-flash-image` (Nano Banana — edição de imagem), enviando a imagem como `image_url` (data URL base64) + o prompt fixo. Modalidade `image`.
  4. Recebe base64 da imagem editada, faz upload no bucket `olx-images` em `enhanced/{listing_id}/{image_id}.png`.
  5. Atualiza `enhanced_storage_path`, `enhancement_status='done'`, `enhanced_at=now()`.
  6. Em erro: `enhancement_status='failed'` + `enhancement_error`.
- Trata 429/402 do Gateway com mensagem clara.
- Loga em `processing_logs`.

## Frontend (`src/routes/_authenticated/listings.$id.tsx`)

### Botão "Tratar fotos com IA"
- Aparece no header do anúncio.
- Ao clicar: chama a Edge Function e faz polling nas imagens (`enhancement_status`) até todas ficarem `done`/`failed`.
- Mostra progresso: "Tratando X de N…".

### Exibição
- Cada foto no carousel/lista ganha um toggle "Original / Tratada" (só habilitado se `enhancement_status='done'`).
- Badge visual quando a foto tem versão tratada.
- Foto tratada é servida via signed URL do bucket privado (`createSignedUrl`, 1h).

### Downloads
- **Individual**: botão de download em cada foto tratada (usa signed URL, força `download` attribute).
- **ZIP com todas tratadas**: botão "Baixar todas (ZIP)" no header. Usa `jszip` no cliente: baixa cada signed URL, empacota como `anuncio-{id}.zip` e dispara download via `file-saver` (ou blob URL nativo).

### Dependência nova
- `bun add jszip`

## Fora do escopo
- Reprocessar automaticamente ao importar (mantém manual).
- Tratamento de foto por foto individual (só "tratar todas" — pode ser adicionado depois se quiser).
