Adicionar botão de excluir foto individual na tela de detalhes do anúncio.

## O que muda

- Em cada miniatura de foto (em `src/routes/_authenticated/listings.$id.tsx`), adicionar um botão "Excluir" ao lado do botão "Tratar / Retratar" (canto superior direito, visível no hover).
- Ao clicar: pedir confirmação e chamar um novo server function `deleteListingImage({ imageId })` que:
  1. Verifica se o anúncio pertence ao usuário (RLS via `requireSupabaseAuth`).
  2. Remove os arquivos do Storage (`storage_path` e `enhanced_storage_path` no bucket `olx-images`, se existirem).
  3. Deleta a linha em `listing_images`.
- Refetch da query de imagens após sucesso e feedback via toast.

## Detalhes técnicos

- Novo arquivo: `src/lib/delete-listing-image.functions.ts` (segue o padrão de `delete-listing.ts` já existente).
- UI: ícone `Trash2` do lucide-react, botão vermelho pequeno com `AlertDialog` de confirmação.
- Sem mudanças de schema, sem mudanças em Edge Functions, sem mudanças em outras telas.
