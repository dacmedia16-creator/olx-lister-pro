## Objetivo
No tratamento da IA, remover marca d'água / logo da OLX e ZAP quando aparecerem sobrepostos na foto.

## Mudança
Arquivo: `supabase/functions/enhance-listing-images/index.ts`

Acrescentar ao `PROMPT` uma instrução explícita de remoção de marca d'água, mantendo o resto do prompt (realismo, nitidez, formato 3:2, sem blur) inalterado:

> "REMOÇÃO DE MARCA D'ÁGUA: se houver logo, selo, marca d'água ou texto sobreposto dos portais OLX ou ZAP Imóveis (canto da foto, faixa, transparência) — remova completamente reconstruindo de forma fotorrealista a parte do ambiente coberta (parede, piso, móvel, céu etc.), sem deixar borrão, mancha, contorno ou fantasma da logo original."

Nenhuma outra alteração: modelo, qualidade (`low`), tamanho, custo estimado no frontend e fluxo de retratar continuam iguais.

## Trade-off
Como está em `quality: "low"` (~US$ 0,02/foto), a reconstrução do fundo onde estava a logo pode ficar menos precisa em logos grandes/centralizadas. Se ficar ruim em algum caso, dá para clicar em "Retratar" naquela foto específica.

## Fora de escopo
Detectar logo por visão computacional antes de chamar a IA, subir qualidade e remover outros tipos de badge (preço, telefone, "oferta").
