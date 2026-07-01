# Correção do import da OLX (validado com docs oficiais da GeckoAPI)

## Diagnóstico

Testei a mesma URL que você importou direto na GeckoAPI e comparei com a doc oficial (PDP e PLP):

- **PDP** retorna dados em `gecko.data.data.*` (dois níveis de wrapper), com `images: [{url}]`, `attributes: [{name,label,value}]`, `seller: {id, nameHash, isProfessional}`, `phoneHashes: []`.
- **`notFound: true`** aparece no ROOT da resposta (não em `data`), e nesse caso `data` vem `null`.
- Para o imóvel que você importou, a GeckoAPI devolveu `images: []` — esse anúncio específico não tem fotos acessíveis pelo parser `data_layer`. Outros tipos (celular, moda, etc.) devem trazer normalmente.

No seu banco, o registro criado ficou com título/preço/descrição nulos e só `city` preenchido. Isso é sintoma de a Edge Function em produção **não estar rodando a versão atual do código** — a versão antiga lia `gecko.data.*` (um nível) em vez de `gecko.data.data.*`.

## O que fazer

1. **Redeploy da função `import-olx-listing`** para garantir que o `getListingRoot` novo (`gecko.data.data`) está no ar.

2. **Ajustes no mapeamento PDP** para bater 100% com a doc:
   - `extractedAt`: ler de `gecko.data.extractedAt` (hoje lê de `gecko.extractedAt`, sempre nulo).
   - `notFound`: já é checado no lugar certo, mantém.
   - Imagens: schema fixo `images[].url`; o fallback multi-chave atual continua servindo como defesa.
   - Seller: `nameHash` já vem hasheado pela GeckoAPI — usar direto em `seller_name_hash` em vez de rehash desnecessário quando o campo já é hash.

3. **Ajustes no mapeamento PLP** (`search-olx-listings`):
   - Itens ficam em `gecko.data.items[]` (não `gecko.data.data.items`).
   - Imagem principal em `items[i].images[0].url` (ou `.webpUrl` como fallback).
   - Campos de paginação: `data.totalResults`, `data.page`, `data.nextPage`, `data.nextPageUrl`.

4. **Log defensivo**: quando o mapeamento não achar `title` na PDP, salvar em `processing_logs.metadata_json` as chaves de topo de `gecko`, `gecko.data` e `gecko.data.data` + status `warning` ("Anúncio retornou sem dados principais"). Isso deixa depuração futura instantânea sem chamar a API à mão.

5. **Log claro quando `images: []`**: manter o registro do anúncio, marcar log como `warning` com mensagem "GeckoAPI devolveu 0 imagens para este anúncio (parser data_layer sem acesso às fotos)" — assim você sabe que não é bug do sistema.

6. **Limpar o registro quebrado atual** (`f2e87269-...`) para reimportar do zero.

## Fora do escopo

- Nenhuma mudança de UI/telas.
- Nada de trocar/pedir outro parser à GeckoAPI (não é opção documentada).

## Como validar

Após deploy:
1. Reimportar a URL do apartamento em `/import` → título, preço, descrição, atributos, cidade, DDD, CEP devem aparecer em `/listings/:id`. Fotos permanecem ausentes (limitação real do anúncio).
2. Importar uma URL de celular/eletrônico → deve trazer fotos.
3. Rodar uma busca em `/search` com `keyword: "iphone"` + `state: "SP"` → lista de resultados deve popular com título, preço e imagem.
