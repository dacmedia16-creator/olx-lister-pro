## Objetivo
Adicionar um botão separado "Remover marca d'água" que trata as fotos apenas para apagar logos/selos dos portais (OLX, ZAP, Viva Real), sem aplicar o tratamento completo de melhoria (nitidez, exposição, outpainting horizontal etc.). Assim o usuário pode escolher entre:
- **Tratar foto** (atual): melhoria completa + remoção de marca d'água + horizontal 3:2.
- **Remover marca d'água** (novo): apenas remove a logo, preservando 100% do resto da foto e do formato original.

## Mudanças

### 1. Edge Function `enhance-listing-images`
- Aceitar novo parâmetro opcional no body: `mode: "enhance" | "watermark_only"` (default `"enhance"` para não quebrar o fluxo atual).
- Quando `mode === "watermark_only"`:
  - Usar um prompt enxuto focado só em apagar logo/selo/marca d'água/texto sobreposto de OLX, OLX Brasil, ZAP, ZAP Imóveis, Viva Real, reconstruindo fotorrealisticamente a área coberta, sem alterar nada mais na cena (sem mexer em exposição, cor, nitidez, enquadramento).
  - Manter `quality: "low"` e `model: gpt-image-1` (mesmo custo de ~US$ 0,02/foto, respeitando o limite atual).
  - **Não** forçar `size=1536x1024`: detectar o aspect ratio da imagem original via header (PNG/JPEG) e escolher o `size` suportado mais próximo (`1024x1024`, `1536x1024` ou `1024x1536`) para preservar a orientação original.
  - Registrar em `processing_logs` com `type: "remove_watermark"` para separar do enhance normal.
- Salvar o resultado no mesmo caminho `enhanced/{listingId}/{imageId}.png` e marcar `enhancement_status = 'done'` (reaproveita a UI de "foto tratada", download e ZIP existentes).

### 2. Frontend — tela de detalhes `src/routes/_authenticated/listings.$id.tsx`
- Adicionar um segundo botão em lote no topo da galeria: **"Remover marca d'água"** ao lado do atual "Tratar fotos".
  - Diálogo de confirmação separado com estimativa (qtd fotos × US$ 0,02) e texto deixando claro que só remove logo.
  - Chama `enhance-listing-images` passando `mode: "watermark_only"` e mesmo mecanismo de lote (`remaining_ids`).
- Em cada miniatura, adicionar um botão/ícone extra **"Só marca d'água"** ao lado do "Tratar/Retratar" individual, chamando a função com `mode: "watermark_only"` e o `image_ids` correspondente.
- Não alterar layout geral, cores ou tokens — só acrescentar os botões usando os componentes shadcn existentes (`Button`, `AlertDialog`, ícone Lucide `Eraser` ou `Sparkles`).

### 3. Sem mudanças
- Banco de dados: nenhuma migração (reutiliza colunas atuais de `listing_images`).
- Bucket, custo máximo (US$ 0,02), limite de 40 fotos, fluxo de OLX/ZAP, download individual e ZIP: tudo inalterado.

## Fora de escopo
- Não vou trocar de modelo de IA nem mudar qualidade.
- Não vou alterar o prompt do enhance completo já existente.
- Não vou mexer em importação, listagem, dashboard ou detecção de portal.
