## Diagnóstico

O anúncio importado mais recente está sem fotos porque:

- A resposta PDP da GeckoAPI veio com `images: []`.
- O fallback PLP encontrou 50 itens, mas não encontrou correspondência exata com o anúncio importado.
- Como corrigimos antes para não pegar fotos do primeiro anúncio aleatório, o sistema preferiu salvar 0 fotos em vez de trazer fotos erradas.

Isso evita contaminação, mas ainda deixa o anúncio sem imagem quando a GeckoAPI PDP não entrega fotos.

## Plano de correção

1. **Melhorar a correspondência PDP ↔ PLP**
   - Normalizar melhor os IDs e URLs da OLX.
   - Comparar `listingId`, `adId`, slug da URL e ID numérico final do anúncio.
   - Remover parâmetros como `?lis=...` antes da comparação.

2. **Fazer fallback PLP seguro por busca direcionada**
   - Em vez de usar apenas a URL de categoria ampla, tentar uma busca mais específica com o título do anúncio.
   - Usar fotos somente se o item encontrado bater com ID/URL/slug do anúncio.
   - Continuar proibindo fallback cego para o primeiro item.

3. **Preservar fotos boas já existentes**
   - Se uma reimportação vier com 0 fotos, não apagar fotos anteriores.
   - Atualizar `images_source` para indicar claramente quando não houve novas imagens.

4. **Adicionar logs de diagnóstico úteis**
   - Registrar IDs comparados, URLs normalizadas, quantidade de candidatos PLP e motivo de não-match.
   - Assim fica claro se o problema é falta de imagem na GeckoAPI ou falha de matching.

5. **Reimplantar e testar**
   - Reimplantar `import-olx-listing`.
   - Reimportar o anúncio atual.
   - Confirmar no banco se `listing_images` recebeu URLs corretas ou se o log mostra que a GeckoAPI não retornou fotos correspondentes.

## Resultado esperado

O sistema só vai exibir fotos quando forem do anúncio correto. Se a GeckoAPI não fornecer fotos do anúncio no PDP nem permitir match seguro no PLP, a tela continuará sem foto, mas com log explicando exatamente o motivo — sem risco de mostrar fotos de outro imóvel.