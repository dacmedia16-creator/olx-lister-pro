## Por que as fotos tratadas saem verticais

O modelo `google/gemini-2.5-flash-image` (Nano Banana) tende a **preservar o aspect ratio da imagem de entrada**. Como as fotos originais da OLX que você enviou são verticais (ex.: 864×1152), o modelo devolve outra vertical, mesmo com o prompt pedindo "horizontal". Instrução textual de orientação é ignorada de forma consistente por esse modelo — é preciso forçar via imagem/canvas de entrada.

## Correção proposta

Alterar `supabase/functions/enhance-listing-images/index.ts` para **forçar orientação horizontal 16:9 na entrada**, em vez de confiar só no prompt.

### Passos técnicos

1. **Pré-processar a imagem original antes de mandar pro Gemini**:
   - Baixar a imagem original (já feito).
   - Redimensionar/encaixar num canvas horizontal 1536×864 (16:9), com a foto centralizada e as bordas preenchidas (letterbox branco ou por espelhamento leve).
   - Enviar esse canvas horizontal como `image_url` para o modelo.
   - Como o Gemini preserva o aspect ratio de entrada, a saída sai horizontal por construção.

2. **Ajustar o prompt** para pedir que o modelo *estenda naturalmente o ambiente nas laterais* (in-paint das bordas), em vez de apenas "melhorar":
   > "Melhore a foto do imóvel mantendo o ambiente real. A imagem está em formato horizontal 16:9 com bordas neutras — preencha as bordas estendendo naturalmente o ambiente (paredes, piso, teto) de forma coerente, sem inventar móveis ou objetos novos. Mantenha iluminação realista."

3. **Implementação do canvas horizontal em Deno** (edge function):
   - Usar `https://deno.land/x/imagescript` (roda em Deno Deploy, sem binários nativos) para: decodificar JPEG/PNG → criar canvas 1536×864 branco → colar a foto redimensionada centralizada → exportar PNG base64.
   - Se a foto original já for horizontal (largura > altura), pular o letterbox e só normalizar para 1536×864 preservando a proporção.

4. **Redeploy** da função `enhance-listing-images`.

### Observação
Fotos já tratadas continuam verticais no bucket — o usuário pode clicar em "Tratar fotos com IA" novamente para reprocessar com o pipeline horizontal.

### Alternativa (se preferir mais simples, sem imagescript)
Trocar o modelo para `google/gemini-3.1-flash-image` (Nano Banana 2), que aceita melhor instruções de aspect ratio e tende a respeitar "gere em 16:9 horizontal" no prompt. Menos código, mas resultado menos garantido que o letterbox.

Qual caminho seguir — **letterbox horizontal (garantido)** ou **trocar de modelo (mais simples)**?
