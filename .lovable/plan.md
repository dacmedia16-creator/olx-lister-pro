## Plano para corrigir fotos do ZAP

Vou ajustar o pipeline do ZAP para seguir o mesmo padrão que já funciona na OLX: PDP primeiro, retry, diagnóstico detalhado e fallback PLP quando o PDP não trouxer fotos.

### 1. Corrigir extração de imagens do ZAP PDP
- Atualizar `supabase/functions/_shared/gecko.ts` para entender melhor os formatos reais do ZAP/Viva Real.
- Além de `url`, procurar campos comuns em objetos de imagem como `imageUrl`, `imageURL`, `uri`, `path`, `href`, `src`, `contentUrl` e variações aninhadas.
- Quando `images` vier como array de objetos sem URL direta, fazer varredura dentro de cada objeto em vez de retornar vazio.
- Manter o resolvedor de template `{action}/{width}x{height}` para virar URL carregável (`fit-in/1200x900`).

### 2. Copiar o fallback PLP da OLX para ZAP
- Generalizar o fallback atual `fetchPlpFallbackImages`, que hoje chama somente `target: "olx.com.br"`.
- Para ZAP, chamar `target: "zapimoveis.com.br"`, `type: "plp"` usando URLs derivadas do link do anúncio.
- Usar o mesmo tipo de match seguro da OLX: ID do anúncio, URL exata/contida e slug, para evitar puxar fotos de anúncio relacionado.

### 3. Melhorar derivação da PLP do ZAP
- A partir de uma URL como `/imovel/...-id-2885261779/`, montar URLs candidatas de listagem sem depender só do caminho da OLX.
- Usar dados do PDP (`address.city`, `address.stateAcronym`, `businessType`, `listingType`, título) para criar tentativas de PLP mais prováveis.

### 4. Melhorar logs de diagnóstico
- Registrar no `processing_logs` para ZAP:
  - campos encontrados em `images`, mesmo quando vierem aninhados;
  - URLs finais já resolvidas;
  - tentativa PDP, retry e PLP fallback;
  - motivo do match do item PLP.

### 5. Deploy e validação
- Fazer deploy da função `import-olx-listing`.
- Reimportar o mesmo anúncio ZAP para atualizar o registro existente.
- Validar no banco que `listing_images` recebeu linhas e que `images_source` ficou `pdp`, `pdp_retry` ou `plp_fallback`, não `none`.

### Fora de escopo
- Não vou mexer em OpenAI/tratamento de fotos.
- Não vou alterar custo/qualidade da IA.
- Não vou mudar layout da tela, exceto se for necessário para exibir as fotos que já existem no banco.