## Diagnóstico

- A importação está chamando a GeckoAPI com sucesso e os dados do anúncio chegam, mas o campo `images` da resposta PDP está vindo como array vazio para o imóvel testado.
- O banco confirma `image_count = 0` para os anúncios atuais.
- Os logs mostram repetidamente: `PDP diagnóstico: 0 foto(s)` com `images: []`, ou seja: hoje o sistema só depende do campo `images` retornado pela GeckoAPI e não tem fallback quando ele vem vazio.

## Plano de correção

1. **Expandir a extração de imagens**
   - Melhorar o helper `extractPdpImages` para procurar URLs de imagem em mais campos possíveis da resposta, não apenas `images/photos/media`.
   - Adicionar varredura segura e limitada em objetos aninhados da resposta para capturar URLs de CDN/imagens (`jpg`, `jpeg`, `png`, `webp`) que possam estar fora do schema principal.
   - Normalizar URLs para HTTPS e deduplicar.

2. **Usar PLP como fallback para imagens**
   - Quando a importação PDP retornar 0 fotos, chamar a GeckoAPI em modo PLP usando uma URL de busca/listagem derivada do próprio anúncio ou dados de localização/categoria.
   - Tentar localizar o mesmo anúncio pelo `listingId`/URL nos resultados PLP.
   - Se encontrado, reaproveitar as imagens do PLP e salvar em `listing_images`.

3. **Melhorar logs de diagnóstico**
   - Registrar quantas imagens vieram de cada fonte: `pdp`, `pdp_deep_scan`, `plp_fallback`.
   - Registrar uma amostra segura dos campos usados, sem expor chave de API.
   - Assim fica claro se a falha é upstream da GeckoAPI ou do nosso parser.

4. **Preservar imagens antigas**
   - Manter a regra atual: se uma reimportação vier com 0 fotos, não apagar fotos já salvas.
   - Só substituir imagens quando uma nova extração trouxer pelo menos 1 URL válida.

5. **Atualizar a interface**
   - Na tela de detalhes, exibir a origem do problema quando não houver fotos: “GeckoAPI retornou 0 imagens para este anúncio”.
   - Manter botão de reimportar e link para abrir na OLX.

6. **Validação**
   - Redeploy da função `import-olx-listing`.
   - Reimportar o anúncio atual e verificar no banco se `listing_images` recebeu URLs.
   - Se a GeckoAPI continuar retornando 0 imagens em PDP e PLP para esse anúncio específico, deixar log explícito comprovando que a API não expôs as fotos.