## Problema

Hoje o pipeline encaixa a foto vertical num canvas 16:9 com **faixas brancas nas laterais** e pede ao Gemini para "estender o ambiente". O modelo está devolvendo a imagem **com as faixas brancas intactas** — ou seja, fica horizontal na resolução, mas visualmente continua uma foto vertical com bordas brancas (foto "depois" que você enviou).

O que você quer: a segunda foto (horizontal real), onde a parede, o piso e o teto continuam naturalmente para os lados, sem faixa branca nenhuma.

## Causa

Dois fatores combinados:
1. **Fundo branco liso** é ambíguo — o modelo interpreta como "moldura/borda intencional" em vez de "área a preencher", e frequentemente devolve como veio.
2. **Prompt textual fraco** para outpainting. O Gemini image respeita muito mais instruções quando a área a completar está visualmente marcada e o prompt é explícito sobre "outpaint / preencher / continuar cena".

## Solução

### Backend (`supabase/functions/enhance-listing-images/index.ts`)

1. **Trocar o letterbox branco por espelhamento borrado das bordas** (edge-mirror blur):
   - Em `toHorizontalCanvas`, quando a foto é vertical e sobra espaço lateral, em vez de preencher com branco:
     - Pegar uma faixa fina da lateral esquerda da foto original, espelhar horizontalmente, esticar para ocupar toda a faixa esquerda do canvas, aplicar blur forte (via `imagescript`).
     - Mesmo processo para a lateral direita.
   - Isso dá ao Gemini um "chute inicial" com as cores/texturas certas (parede continua parede, piso continua piso) em vez de branco puro — resultado: o modelo refina em cima disso e entrega ambiente contínuo, sem faixa branca.
   - Mesma lógica para fotos horizontais que precisam de padding em cima/embaixo (raro, mas cobrimos).

2. **Reescrever o `PROMPT`** para ser explícito sobre outpainting:
   - Deixar claro: "as laterais contêm uma prévia borrada do próprio ambiente — substitua por continuação nítida e realista da parede, piso e teto. NÃO deixe faixas brancas, NÃO deixe bordas borradas no resultado final. Toda a imagem deve parecer uma foto única e nítida."
   - Manter a instrução de não inventar móveis novos nem alterar o ambiente original.

3. **Validação pós-Gemini contra faixas brancas** (leve, sem estourar CPU):
   - Após receber a imagem do Gemini, amostrar ~20 pixels na coluna 2% da esquerda e 2% da direita.
   - Se >70% desses pixels forem quase-branco (R,G,B > 245), considerar "faixa branca não removida" e refazer a chamada uma vez (retry único) com prompt reforçado.
   - Se ainda assim vier branco no retry, aceitar (evita loop infinito) e registrar `white_bars_detected: true` no `processing_logs` para auditoria.

### Fora do escopo
- Não mexer no frontend (o botão em lotes de 2 já funciona).
- Não trocar o modelo Gemini.
- Não alterar a lógica de download/upload/status.

### Deploy
- Redeploy da função `enhance-listing-images`.
- Para testar: abrir um anúncio já importado, clicar "Tratar fotos com IA" de novo (o pipeline atualiza `enhanced_storage_path` via upsert).