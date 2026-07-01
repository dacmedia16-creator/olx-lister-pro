## Excluir anúncio importado

Adicionar opção de excluir anúncios importados, com confirmação.

### Onde
- **Tela de detalhes** (`/listings/$id`): botão "Excluir anúncio" no cabeçalho, com `AlertDialog` de confirmação. Após excluir, redireciona para `/listings`.
- **Lista de anúncios** (`/listings`): botão de lixeira em cada card, com confirmação inline.

### Backend
- Server function `deleteListing` (`src/lib/listings.functions.ts`) com `requireSupabaseAuth`:
  - Valida que o `olx_listing` pertence ao usuário (RLS já garante).
  - Remove imagens do Storage (`olx-images`) associadas em `listing_images` (quando `storage_path` existir).
  - Deleta o registro em `olx_listings` (cascade cuida de `listing_images`; se não houver cascade, deletar `listing_images` primeiro).
  - Também limpa referências em `olx_search_results.imported_listing_id` (set null).

### UX
- Botão destrutivo (variant="destructive") com ícone Trash2.
- Diálogo: "Excluir este anúncio? Esta ação não pode ser desfeita. As imagens armazenadas também serão removidas."
- Toast de sucesso/erro e invalidação das queries de listagem.

Sem mudanças em Edge Functions nem no schema.
