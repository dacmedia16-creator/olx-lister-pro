## Objetivo

Ao clicar em uma miniatura (ou na foto principal do carrossel), abrir um **lightbox** em tela cheia com a foto ampliada, sem interferir nos botões de ação (Tratar / Marca / Baixar / Excluir).

## Mudanças

### 1. Novo componente `src/components/ImageLightbox.tsx`

- Modal fullscreen com fundo escuro (`bg-black/90`), fechado ao clicar fora, no botão ✕ ou tecla `Esc`.
- Imagem centralizada com `max-h-[95vh] max-w-[95vw] object-contain` e `referrerPolicy="no-referrer"`.
- Setas ← → (teclado e botões) para navegar entre as fotos da lista.
- Contador `x / total` no topo.
- Botão de download da foto atual (usa a URL exibida).

### 2. `src/routes/_authenticated/listings.$id.tsx`

- Estado `lightboxIndex: number | null`.
- Envolver cada `<img>` da grade de miniaturas em um `<button type="button" onClick={() => setLightboxIndex(idx)}>` — as ações da barra inferior já usam `stopPropagation`, então não vão abrir o lightbox por engano.
- Tornar a imagem principal do `OlxImageCarousel` clicável para abrir no índice 0 (ou passar `onImageClick` como prop).
- Renderizar `<ImageLightbox images={displayUrls} index={lightboxIndex} onClose={...} />` no final da página.
- Cursor `cursor-zoom-in` na miniatura para deixar óbvio.

### 3. `src/components/OlxImageCarousel.tsx`

- Adicionar prop opcional `onImageClick?: (index: number) => void`; quando presente, aplicar no `<img>` principal com `cursor-zoom-in`.

## Não muda

- Edge functions, banco, estilos globais.
- Botões de ação por foto continuam funcionando exatamente como estão.