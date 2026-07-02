## Objetivo
Deixar as fotos tratadas pela IA com aparência mais **realista** (menos "renderizada"/"catálogo"), mantendo o custo atual (~US$ 0,02/foto, `quality: "low"`).

## Diagnóstico
Hoje o prompt em `supabase/functions/enhance-listing-images/index.ts` já pede realismo e proíbe render 3D, mas na prática `gpt-image-1` em `low`:
- suaviza demais texturas (parede, madeira, tecido) → aparência plástica
- eleva iluminação/contraste → visual de estúdio
- satura levemente cores → look de revista

## Mudanças propostas (só no prompt `PROMPT` — modo "Tratar completo")

Reforçar a seção de realismo com regras mais duras e exemplos negativos explícitos:

1. **Textura preservada** — obrigar manutenção de poros de parede, veios de madeira, trama de tecido, imperfeições de piso, marcas de uso. Proibir "smoothing", superfícies "limpas demais", aparência de cerâmica/plástico.
2. **Iluminação natural intocada** — manter a luz da foto original (temperatura, direção, intensidade). Proibir realce de janelas, "golden hour" artificial, preenchimento de sombras, HDR, halos.
3. **Cores fiéis** — manter saturação e balanço de branco originais; permitida apenas correção sutil se a foto estiver visivelmente amarelada/azulada. Proibir cores "vivas", céu mais azul, verde de plantas realçado.
4. **Ruído fotográfico preservado** — manter o grão original da câmera/celular; não aplicar denoise agressivo.
5. **Referência mental explícita** — instruir o modelo a mirar em "foto de celular de corretor de imóveis" e não em "foto profissional de catálogo/Airbnb Plus/render de arquitetura".
6. **Lista negativa ampliada** — proibir explicitamente: look Airbnb Plus, render Lumion/V-Ray/Enscape, staging virtual, aparência de e-commerce, brilho especular exagerado em pisos, reflexos irreais em vidros/TVs.

Manter intactas as regras já existentes de:
- geometria/linhas retas (não regride nada do último ajuste)
- nitidez total (sem blur/bokeh)
- remoção de marca d'água com reconstrução fotorrealista
- saída horizontal 3:2 com outpainting quando vertical

O modo `WATERMARK_ONLY_PROMPT` **não muda** (ele já preserva o original 1:1).

## Arquivo alterado
- `supabase/functions/enhance-listing-images/index.ts` — reescrever a constante `PROMPT` com as regras acima; deploy da função.

## Como testar
Após deploy, clicar **Retratar** em 1–2 fotos que ficaram com cara de render e comparar com o original.

## Custo
Sem alteração — segue `quality: "low"` a ~US$ 0,02/foto. Se mesmo assim o resultado continuar "renderizado", o próximo passo (fora deste plano) seria subir para `quality: "medium"` (~US$ 0,07/foto), o que exige aprovação explícita por causa do custo.