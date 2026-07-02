# Seleção múltipla de fotos para tratamento em lote

## Objetivo
Permitir escolher fotos específicas do anúncio e aplicar "Tratar com IA" ou "Remover marca d'água" apenas nas selecionadas — em vez de sempre processar todas.

## Mudanças em `src/routes/_authenticated/listings.$id.tsx`

### Estado
- Novo `selectedIds: Set<string>` para fotos marcadas.
- Novo `selectionMode: boolean` para alternar UI de seleção.

### Header do card "Fotos"
- Botão toggle **"Selecionar fotos"** (Check icon). Quando ativo:
  - Substitui os botões atuais "Tratar" / "Remover marca" por:
    - `Tratar selecionadas (N)` — desabilitado se N=0
    - `Remover marca das selecionadas (N)` — desabilitado se N=0
    - `Selecionar todas` / `Limpar seleção`
    - `Cancelar` (sai do modo seleção)
  - Os botões abrem o mesmo `AlertDialog` de confirmação existente (com `QualityPicker` e custo estimado), mas passando apenas os IDs selecionados no lugar de "todas as fotos".

### Grid de miniaturas
- Quando `selectionMode` estiver ativo:
  - Cada thumbnail ganha um `Checkbox` (canto superior direito) sobre a imagem.
  - Clicar na foto alterna a seleção (em vez de abrir o lightbox).
  - Overlay sutil (ring azul) nas selecionadas.
  - Barra de ações inferior individual fica oculta para evitar cliques acidentais.

### Fluxo de confirmação
- `openEnhanceConfirm(mode, imageIds?)`: aceita lista opcional de IDs. Se omitida, mantém comportamento atual (todas as fotos com `original_external_url`).
- O diálogo mostra `N foto(s) selecionada(s)` quando vindo do modo seleção.
- `runEnhance` já processa em lotes de 2 — reaproveitado sem mudança lógica, apenas restringido aos IDs recebidos.

## Detalhes
- Sem mudanças em Edge Functions, banco ou storage — apenas UI e escopo dos IDs enviados.
- Sem alteração nos cards da lista de anúncios (`listings.index.tsx`) — seleção é por foto, faz sentido só na tela de detalhes.
