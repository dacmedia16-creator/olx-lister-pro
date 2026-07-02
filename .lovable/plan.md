## Objetivo
Adicionar uma nova rota `/tools/enhance` (menu "Tratar fotos") onde o usuário sobe fotos direto do computador, escolhe o modo (Tratar completo ou Remover marca d'água) e recebe as versões processadas pela IA, salvas no histórico para reabrir e baixar depois.

## Backend

### Nova tabela `photo_batches` (lote avulso)
- `id uuid pk`, `user_id uuid`, `name text` (default "Lote DD/MM HH:mm"), `mode text check in ('enhance','watermark_only')`, `status text`, `image_count int`, `created_at`, `updated_at`.
- RLS: dono apenas. GRANT authenticated + service_role.

### Reaproveitar `listing_images`? Não.
Criar `photo_batch_images` espelhando o essencial:
- `id`, `batch_id fk`, `user_id`, `position int`, `original_storage_path text`, `enhanced_storage_path text`, `enhancement_status text` (queued/processing/done/failed), `error_message`, `enhanced_at`, `created_at`.
- Sem `original_external_url` — a foto original mora no bucket `olx-images` em `${user_id}/uploads/${batch_id}/original/${image_id}.${ext}`.
- Enhanced em `${user_id}/uploads/${batch_id}/enhanced/${image_id}.png`.
- RLS + GRANTs iguais.

### Edge Function `enhance-listing-images` — mínima extensão
Aceitar payload alternativo `{ batch_id, image_ids?, mode }`:
- Se vier `batch_id`, valida ownership em `photo_batches`, busca linhas em `photo_batch_images`, baixa bytes do storage (`original_storage_path`) em vez de `original_external_url`, roda o mesmo pipeline (prompt/size já corretos), grava `enhanced_storage_path` e atualiza `enhancement_status`.
- Mantém contrato atual `{ listing_id, ... }` intacto — não quebra fluxo dos anúncios.
- `mode` já suportado (`enhance` | `watermark_only`).
- Log em `processing_logs` com `type = "enhance_upload" | "remove_watermark_upload"` e `metadata_json.batch_id`.

Sem nova função, sem novo secret, sem mexer em custo.

## Frontend

### Menu
- Adicionar link "Tratar fotos" no shell autenticado (mesmo lugar dos outros itens).

### Rota `src/routes/_authenticated/tools.enhance.tsx` (listagem de lotes)
- Botão "Novo lote" → abre `tools.enhance.new.tsx`.
- Tabela de lotes: nome, modo (badge), qtd fotos, status agregado, data, ações (Abrir, Excluir).

### Rota `src/routes/_authenticated/tools.enhance.new.tsx` (criar lote)
- Seletor de modo (radio): **Tratar completo (3:2)** vs **Remover marca d'água (mantém original)**.
- Dropzone múltiplo (aceita JPG/PNG, até 20 fotos por lote, 15 MB cada).
- Preview em grid com miniaturas + botão remover antes de enviar.
- Botão "Enviar e processar":
  1. Cria `photo_batches` (status=queued).
  2. Faz upload direto no bucket `olx-images` (client Supabase) para cada arquivo → insere `photo_batch_images` com `original_storage_path`.
  3. Dispara `enhance-listing-images` em lotes de 2 (respeitando `MAX_PER_CALL` atual) com AlertDialog de custo estimado (mesmo componente já usado em `listings.$id.tsx`, reaproveitando cálculo `qtd * 0,02 USD`).
  4. Redireciona para `tools.enhance.$id.tsx`.

### Rota `src/routes/_authenticated/tools.enhance.$id.tsx` (detalhe do lote)
- Igual galeria de `listings.$id.tsx` porém apontando para `photo_batch_images`:
  - Miniatura original (signed URL) + versão tratada (signed URL) lado a lado.
  - Botão "Retratar" individual, "Remover marca" individual (respeita o modo do lote como default, mas permite trocar por foto).
  - Botão "Baixar tudo (ZIP)" — reusa `downloadEnhancedZip` de `src/lib/enhanced-images.ts`.
  - Botão "Excluir foto" e "Excluir lote" (novos helpers `delete-batch-image.ts` / `delete-batch.ts` espelhando os existentes).

### Reuso
- `HashBadge`, AlertDialog de custo, `getEnhancedSignedUrl`, `downloadEnhancedZip` já servem — nada novo em `src/lib/enhanced-images.ts` além de aceitar path arbitrário (já aceita).

## Fora de escopo
- Sem mudança no fluxo OLX/ZAP, sem novo modelo de IA, sem alteração de prompt/qualidade/custo.
- Sem colar essas fotos em anúncios existentes.
- Sem processamento em background/worker — mantém o mesmo padrão "dispara em lotes de 2 até acabar" já usado.

## Técnico (curto)
- Migration cria `photo_batches` + `photo_batch_images` com GRANTs + RLS por `auth.uid()`.
- Bucket: reaproveita `olx-images` (privado, signed URLs).
- Edge fn: um `if (body.batch_id)` no topo do handler que carrega registros da nova tabela e segue o mesmo loop de processamento.
- Client: TanStack Query para listagem de lotes e imagens; upload via `supabase.storage.from('olx-images').upload(...)`.
