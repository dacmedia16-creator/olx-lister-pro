Adicionar botões **Tratar** e **Remover marca** em cada card da tela "Anúncios importados" (`/listings`), reaproveitando o mesmo diálogo de qualidade Baixa/Média já usado na tela de detalhes.

## Comportamento
- Cada card ganha dois botões pequenos sobre a imagem (ao lado do botão de excluir): ✨ Tratar e 🩹 Marca.
- Clicar abre um `AlertDialog` com:
  - Contagem de fotos daquele anúncio que serão processadas.
  - `QualityPicker` (Baixa ~US$ 0,02 · Média ~US$ 0,07).
  - Custo total estimado calculado dinamicamente.
  - Botões Cancelar / Confirmar.
- Ao confirmar, invoca `enhance-listing-images` em lotes de 2, passando `listing_id`, `mode` (`enhance` ou `watermark_only`) e `quality`.
- Toast de progresso e resultado (ok/total).
- Enquanto processa aquele card, botões ficam desabilitados e mostra spinner discreto.

## Detalhes técnicos
- Arquivo a editar: `src/routes/_authenticated/listings.index.tsx`.
- Reaproveitar `QualityPicker` e `QUALITY_COST_USD` de `@/components/QualityPicker`.
- Contagem de fotos: consulta rápida a `listing_images` filtrando por `original_external_url not null` no momento de abrir o diálogo (mesma lógica de `openEnhanceConfirm` em `listings.$id.tsx`).
- Ícones: `Sparkles`, `Eraser` de `lucide-react`.
- Nenhuma mudança em Edge Function, banco ou outras telas.
