## Objetivo

Antes de disparar o tratamento em lote (`enhance-listing-images`), abrir um `AlertDialog` mostrando quantidade de fotos e custo estimado em USD, exigindo confirmação explícita do usuário.

## Escopo

Apenas frontend — `src/routes/_authenticated/listings.$id.tsx`. Nenhuma mudança na Edge Function, banco ou preço real (a Edge continua chamando OpenAI com `quality: high`, `size: 1536x1024`).

O botão individual "Tratar" por foto **não** recebe confirmação (é 1 clique = 1 imagem, sem lote). Só o botão "Tratar fotos com IA" / "Retratar com IA".

## Implementação

1. **Constante de custo** no topo do arquivo:
   ```ts
   // Custo aproximado por imagem: gpt-image-1, quality=high, size=1536x1024
   const COST_PER_IMAGE_USD = 0.19;
   ```
   Valor baseado na tabela pública da OpenAI para `gpt-image-1` em `high` nessa resolução. Comentário explica de onde vem.

2. **Novo estado** para controlar o diálogo:
   ```ts
   const [confirmOpen, setConfirmOpen] = useState(false);
   const [pendingCount, setPendingCount] = useState(0);
   ```

3. **Novo handler `openEnhanceConfirm`**: consulta rápida no Supabase para contar quantas imagens têm `original_external_url` (mesma lógica que hoje monta a `queue`), guarda em `pendingCount` e abre o diálogo. Se `0`, mostra `toast.error` como já faz e não abre.

4. **Trocar `onClick={enhance}` do botão principal** por `onClick={openEnhanceConfirm}`. A função `enhance` atual permanece igual e passa a ser chamada só quando o usuário confirma no diálogo.

5. **`AlertDialog` novo** (já usamos `@/components/ui/alert-dialog` no projeto para exclusão) renderizado no final do JSX, com:
   - Título: "Confirmar tratamento com IA"
   - Descrição incluindo:
     - `{pendingCount} foto(s)` serão processadas
     - Custo estimado: `US$ {(pendingCount * COST_PER_IMAGE_USD).toFixed(2)}` (`~US$ 0,19 por foto`)
     - Aviso curto: "Retratar sobrescreve as fotos já tratadas e gera novo custo."
   - Ações: "Cancelar" (fecha) e "Confirmar e tratar" (fecha + chama `enhance()`).

## Fora do escopo

- Limite diário/orçamento por usuário.
- Log de custo real por imagem em `processing_logs`.
- Trocar `quality` para `medium`/`low`.
- Confirmação no botão de retratar individual.

Esses ficam para uma próxima iteração se você quiser.
