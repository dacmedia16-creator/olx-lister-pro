## Por que o anúncio do ZAP não trouxe fotos

Fui atrás do que aconteceu na última importação (`https://www.zapimoveis.com.br/imovel/...-id-2895954575/`) e confirmei nos logs e no banco:

- O PDP do ZAP na GeckoAPI voltou com título/descrição, mas **sem nenhuma imagem** (`images_source = "none"`, 0 imagens em `listing_images`).
- A Edge Function tentou o fallback PLP do ZAP várias vezes (dá pra ver os `plp-image-fallback-zap attempt=1 status=200` nos logs), mas nenhum resultado bateu com o anúncio → registrei `warning: "GeckoAPI retornou 0 imagens em PDP e fallback PLP"`.

Ou seja, **não é bug do storage nem do frontend** — a GeckoAPI simplesmente não devolveu foto pra esse anúncio, e o fallback PLP não conseguiu casar. Motivos combinados:

1. **PDP do ZAP** frequentemente vem sem galeria (limitação da própria GeckoAPI documentada — os campos `images/photos/media` chegam vazios).
2. **PLP do ZAP** exige `city + state + businessType`. O PDP devolveu `address.city = null / stateAcronym = null`, então dependemos do parser do `formattedAddress` ("... Sorocaba - SP"). Ele extrai `Sorocaba/SP`, mas a busca PLP resultante lista **os anúncios em destaque de Sorocaba**, e o `id 2895954575` provavelmente não apareceu nas primeiras páginas varridas → o match exige `score >= 45` com `id/url/slug`, então é descartado.
3. Sem match, a função preserva as imagens anteriores (que nesse caso eram zero) e finaliza como sucesso, mas sem foto.

## O que proponho corrigir

Mudanças focadas em aumentar a taxa de acerto do fallback PLP do ZAP, sem tocar em OLX, storage, IA ou UI de detalhes.

### Edge Function `import-olx-listing`

1. **Endurecer o parser de endereço do ZAP** (`parseZapAddressFallback`)
   - Já pega city/state; adicionar extração do bairro real (o texto antes de "Sorocaba" na 2ª vírgula) e usar como `neighborhood` no payload PLP para reduzir o universo de resultados.
2. **Payloads PLP mais precisos**
   - Além de `city+state+businessType`, incluir variações com `neighborhood`, `bedrooms` (extraído do título "3 quartos") e faixa de preço (±15% quando houver preço) — hoje já removemos filtros de banheiros/vagas, mas quartos + bairro reduzem drasticamente o ruído.
   - Ordenar por `updated_desc` para pegar o anúncio recém-listado (o do exemplo é de 30/06).
3. **Match mais tolerante**
   - Aceitar match por `listing_id` presente em qualquer campo string do item (hoje só varremos alguns campos conhecidos); a GeckoAPI às vezes coloca o id só dentro de `link`/`url`/`sourceUrl`.
   - Aceitar match por **slug do imóvel** (parte do path com bairro + tipo) além do id numérico.
4. **Segunda tentativa: buscar direto o anúncio na PLP por `keyword` = título completo + bairro**
   - Novo payload extra quando os anteriores não acharem: PLP com `keyword` = "3 quartos Jardim Sao Carlos 102m2" (montado a partir de bairro + quartos + área extraídos do título).
5. **Log detalhado**
   - Salvar em `processing_logs` o `attempts` do fallback (URL PLP, payload, item_count, top scores) para conseguir depurar sem precisar reimportar.

### Sem mudanças

- Não mexer em OLX, `enhance-listing-images`, storage, UI de detalhes/galeria, migrations, secrets, custo de IA.
- Não trocar de provedor (GeckoAPI continua) — se mesmo com essas melhorias o anúncio continuar sem foto, é limitação real do provider e o log detalhado vai deixar isso explícito.

## Fora de escopo
- Extrair fotos direto do site do ZAP (scraping próprio).
- Alterar layout ou fluxo do frontend.
- Reimportar automaticamente anúncios antigos — depois do deploy, basta clicar de novo em "Importar" no anúncio do ZAP que deu ruim.
