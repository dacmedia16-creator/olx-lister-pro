## Problema

Em `quality: "low"` o `gpt-image-1` deforma geometria: linhas retas ficam curvas, janelas ficam trapezoidais, móveis ganham proporções erradas (o sofá circulado no print é um exemplo). O prompt atual foca em nitidez e remoção de marca d'água, mas não impõe restrições explícitas de geometria/perspectiva.

## Correção (somente prompt, sem custo extra)

Editar `supabase/functions/enhance-listing-images/index.ts` — apenas as constantes `PROMPT` e `WATERMARK_ONLY_PROMPT`. Nenhuma mudança em lógica, custo ou UI.

Adicionar ao `PROMPT` uma seção **"GEOMETRIA E PROPORÇÕES (CRÍTICO)"** com regras rígidas:
- Preservar 100% a geometria original: linhas retas continuam retas (paredes, batentes, rodapés, molduras de janela, quadros, TV, prateleiras, pisos).
- Proibido curvar, entortar, arquear, inclinar ou distorcer qualquer aresta reta.
- Janelas, portas, quadros e TVs devem manter retângulos perfeitos com cantos a 90°.
- Móveis (sofá, cama, mesa, cadeira, armário) devem manter EXATAMENTE o mesmo formato, proporção, número de almofadas/gavetas/pernas e posição — proibido alongar, encolher, curvar encosto, mudar ângulo de braços ou fundir peças.
- Perspectiva e linhas de fuga da foto original devem ser preservadas — proibido mudar ponto de vista, altura da câmera ou lente aparente.
- Piso deve manter o mesmo padrão, direção das réguas/tábuas e alinhamento.
- Pessoas, plantas e objetos decorativos mantêm forma anatômica correta — proibido membros extras, dedos deformados, folhas derretidas.
- Reafirmar: a saída deve parecer a MESMA foto, apenas mais limpa e sem marca d'água — não uma reinterpretação.

Adicionar o mesmo bloco ao `WATERMARK_ONLY_PROMPT` (com ênfase ainda maior, já que esse modo promete preservação total).

Depois de salvar, fazer deploy da edge function `enhance-listing-images` para o prompt entrar em vigor. Fotos já processadas precisam ser retratadas com o botão "Tratar/Retratar" para pegar o novo prompt.
