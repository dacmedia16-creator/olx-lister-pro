## Problema

Na galeria de miniaturas do anúncio, os botões **Tratar**, **Marca** (remover marca d'água) e **Excluir** só aparecem no hover (`opacity-0 group-hover:opacity-100`) e são muito pequenos. É fácil clicar fora do botão ou não perceber que ele existe — o usuário achou que estava clicando em "remover marca" mas na verdade acionou outra ação (provavelmente "Baixar ZIP" no topo, ou o link "Abrir na OLX").

## Solução

Tornar as ações por foto sempre visíveis e inequívocas na miniatura.

### Mudanças em `src/routes/_authenticated/listings.$id.tsx` (linhas 425–495)

1. **Barra de ações fixa** no rodapé de cada miniatura, sempre visível (sem depender de hover), com fundo semitransparente:
   - Botão ✨ **Tratar** (ou **Retratar** se já tratada)
   - Botão 🧽 **Marca** (remover marca d'água)
   - Botão 🗑 **Excluir**
2. Cada botão com `type="button"`, `stopPropagation` no `onClick`, `title` e `aria-label` claros, tamanho de toque mínimo 28×28 px (funciona em mobile).
3. Manter o badge **IA** / **falhou** no canto superior esquerdo e o overlay "tratando…" quando `isProcessing`.
4. Adicionar uma legenda curta acima da grade: *"Passe o mouse ou toque em cada foto para tratar, remover marca d'água ou excluir individualmente."*

### Não muda

- Edge Function `enhance-listing-images` continua igual.
- Botões em lote no topo do card **Fotos** permanecem inalterados.
- Nenhuma mudança de banco.

Resultado: fica visualmente óbvio qual botão remove a marca d'água de UMA foto, sem risco de clicar em download por engano.