## Problema

Na tela `/tools/enhance/new`, clicar na área tracejada "Clique para selecionar fotos ou arraste aqui" não abre o seletor de arquivos. A causa é o padrão `<label>` envolvendo um `<input type="file" class="hidden">` — em algumas combinações de navegador/DevTools o clique não propaga para o input oculto, e além disso o texto promete drag-and-drop que hoje não está implementado.

## Correção (somente frontend, arquivo `src/routes/_authenticated/tools.enhance.new.tsx`)

1. Substituir o `<label>` que envolve o input por um `<div role="button" tabIndex={0}>` com `onClick` que chama `inputRef.current?.click()`.
2. Manter o `<input type="file" ref={inputRef} className="sr-only">` como irmão (fora do div clicável) para evitar conflito de propagação.
3. Adicionar suporte real a arrastar-e-soltar: handlers `onDragOver` (preventDefault + estado `dragActive`), `onDragLeave`, `onDrop` (chama `onPick(e.dataTransfer.files)`).
4. Feedback visual: borda destacada quando `dragActive`, cursor `not-allowed` quando `processing || files.length >= MAX_FILES`, e mensagem "Máximo atingido" nesse caso.
5. Suporte a teclado: `onKeyDown` disparando o click em `Enter`/`Space`.

Nenhuma mudança em lógica de upload, banco, edge function ou custo — só o gatilho de abertura do seletor e o dnd.
