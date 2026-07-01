## Ajuste do prompt de IA: sempre horizontal

### Objetivo
Alterar o prompt da Edge Function `enhance-listing-images` para que as fotos tratadas pela IA sejam sempre geradas na orientação horizontal, nunca vertical.

### Alteração
1. **Arquivo**: `supabase/functions/enhance-listing-images/index.ts`
   - **Linha 17**: trocar `PROMPT = "Melhore a imagem sem mudar o ambiente, deixe na Vertical."` para `PROMPT = "Melhore a imagem sem mudar o ambiente, deixe na horizontal."`.

2. **Deploy**: reimplantar a Edge Function `enhance-listing-images` para que a mudança entre em vigor nas próximas chamadas.

### Nota
Fotos já tratadas anteriormente com o prompt vertical permanecem como estão (armazenadas no bucket). Novas execuções do botão "Tratar fotos com IA" usarão o prompt horizontal.