## Diagnóstico

Verifiquei o anúncio ZAP que você importou (`Apartamentos para alugar…Jardim`) e os logs da GeckoAPI. O PDP do ZAP retornou tudo corretamente — o payload traz `title, prices, address, advertiser, images, amenities, description, formattedAddress` etc. Nada disso caiu no banco (preço, cidade, UF, atributos, fotos = tudo vazio). Dois bugs específicos no `import-olx-listing` explicam o problema:

### Bug 1 — mapeamento de campos está 100% OLX

A função `mapListing` procura os campos da OLX (`price.value`, `location.city`, `location.state`, `seller.name`, `listedAt`, `attributes`, etc.). O ZAP usa nomes diferentes:

| Dado | OLX | ZAP (real) |
|---|---|---|
| Preço | `price.value` | `prices.price` |
| Condomínio / IPTU | — | `prices.monthlyCondoFee`, `prices.iptu` |
| Cidade / UF / bairro | `location.city / state / neighborhood` | `address.city / stateAcronym / neighborhood` |
| Endereço formatado | — | `formattedAddress` |
| Vendedor | `seller.name / phones` | `advertiser.name / phoneNumbers / whatsAppNumber / creci` |
| Data | `listedAt` | `createdAt` / `updatedAt` |
| Atributos | `attributes` | `amenities` + `mainAmenities` + `infoTags` |
| Categoria | `category` | `businessType` (RENTAL/SALE) + `listingType` |

O `pick()` cai no fallback e grava `null` em quase tudo — por isso o card ZAP aparece só com título.

### Bug 2 — URLs de foto do ZAP vêm com placeholders

O ZAP entrega imagens como:
```
https://resizedimgs.vivareal.com/{action}/{width}x{height}/vr.images.sp/<hash>.webp
```
Nossos extractors passam pelo `isLikelyImageUrl` (o `.webp` no fim), mas os tokens `{action}` e `{width}x{height}` são placeholders literais — o navegador não carrega. Precisamos substituir por valores reais antes de salvar (`fit-in` / `1200x900`) e só então validar/inserir.

## Correção proposta

Arquivos afetados: `supabase/functions/import-olx-listing/index.ts` e `supabase/functions/_shared/gecko.ts`. Nada muda no fluxo OLX.

1. **Mapping ZAP dedicado em `mapListing`**  
   Quando `portal === "zap"`, ler dos caminhos corretos: `prices.price` (preço), `address.city / stateAcronym / neighborhood / zipCode`, `advertiser.id / name / phoneNumbers / whatsAppNumber / mainPhone`, `createdAt` para `listed_at`, `businessType` para `main_category`, `listingType` para `sub_category`, `formattedAddress` num novo item de `attributes_json`, e consolidar `amenities + mainAmenities + infoTags + prices.monthlyCondoFee + prices.iptu + virtualTourUrl + condominiumName` em `attributes_json`. Manter hash de telefones/nome do advertiser (LGPD igual OLX).

2. **Extractor de imagens ZAP em `_shared/gecko.ts`**  
   Adicionar um passo de "resolve template" no `pickUrl` / `normalizeUrl`: se a URL contém `{action}` ou `{width}` / `{height}`, trocar por `fit-in` e `1200x900` (padrão vivareal/resizedimgs). Só depois validar com `isLikelyImageUrl`. Isso desbloqueia as fotos do ZAP sem afetar OLX.

3. **Diagnóstico**  
   Log de importação ZAP com `image_source`, contagens e amostra das URLs finais (já resolvidas) para conferir na tabela `processing_logs`.

4. **Reimportar o anúncio de teste**  
   Depois do deploy, refazer a importação do link ZAP existente (o `upsert` por `source_url` atualiza o mesmo registro) para popular preço/endereço/fotos.

## Fora de escopo (não vou mexer)

- Buscar telefone real do proprietário — a GeckoAPI só devolve o número do anunciante (imobiliária) quando publicado; se vier, é gravado como hash (mesma regra da OLX, LGPD).
- PLP do ZAP (busca por filtros) — o link que você mandou é doc de PLP, mas hoje sua tela "Buscar OLX" só chama `search-olx-listings`. Se quiser busca ZAP também, é outra etapa (posso planejar depois).
- Redesenhar UI: os campos novos (condomínio, IPTU, endereço formatado, tour virtual) só aparecerão nos JSONs de atributos. Se quiser destacá-los na tela de detalhes, faço num próximo passo.
