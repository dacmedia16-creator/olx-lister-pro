Ajustar o prompt de tratamento de imagens na Edge Function `enhance-listing-images` para gerar resultados mais realistas.

## Mudança

Em `supabase/functions/enhance-listing-images/index.ts`, atualizar o prompt enviado ao `gpt-image-1` para reforçar realismo fotográfico:

- Manter fielmente o ambiente, móveis, texturas, iluminação natural e cores originais do imóvel.
- Proibir estilização, HDR exagerado, saturação artificial, superfícies "plásticas", efeitos de renderização 3D ou aparência de foto de catálogo idealizada.
- Solicitar aparência de foto real de imóvel: iluminação natural equilibrada, sombras suaves preservadas, ruído sutil aceitável, nitidez moderada.
- Melhorias permitidas: correção de exposição, balanço de branco neutro, remoção de blur leve, endireitamento sutil.
- Manter formato horizontal 3:2 (1536x1024) já configurado.

Nenhuma outra alteração (UI, banco, fluxo em lote/individual permanecem iguais).

## Deploy

Redeploy da função `enhance-listing-images`. As próximas fotos tratadas (ou retratadas individualmente) já usarão o prompt novo.