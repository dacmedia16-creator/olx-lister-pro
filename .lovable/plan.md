## Contexto

A GeckoAPI (nossa única fonte de dados da OLX) tem duas limitações do próprio provedor:

- **Telefone e nome do vendedor** vêm apenas como hash SHA-256 (`phoneHashes[]`, `seller.nameHash`) por LGPD — nunca em texto puro. Servem para identificar o mesmo vendedor entre anúncios diferentes, não para contato direto.
- **Fotos** dependem do parser (`data_layer` / `jsonld`) achar as imagens na página da OLX. Em algumas categorias (imóveis é o caso mais comum) a página não expõe as fotos nesse formato e o array `images` vem vazio. Não é bug nosso.

O anúncio que você abriu é exatamente esse cenário: dados do imóvel vieram (título, preço, cidade, atributos), mas `phoneHashes` e `images` chegaram vazios da GeckoAPI.

## Mudanças no frontend

### Tela de Detalhes do anúncio (`src/routes/_authenticated/listings.$id.tsx`)

1. **Bloco "Vendedor"** — reformular para deixar claro o que é hash:
   - Mostrar `seller.id` (identificador público) como texto normal.
   - Mostrar `nameHash` truncado (ex.: `9be1b9ec…b34b1241`) com um badge "Hash LGPD" e um tooltip: *"A GeckoAPI entrega o nome apenas hasheado (SHA-256) por conformidade LGPD. Use este hash para identificar o mesmo vendedor entre anúncios."*
   - Mesmo tratamento para cada item de `phone_hashes` (badge "Hash LGPD" + tooltip explicando que não é possível recuperar o número).
   - Quando `phone_hashes` for `null` / vazio: mostrar mensagem *"Este anúncio não expôs telefones no momento da extração."*
   - Botão secundário **"Abrir na OLX"** apontando para `source_url` (o usuário pode ver o telefone real direto no site quando quiser).

2. **Galeria de fotos** — quando `listing_images` estiver vazio:
   - Substituir o placeholder atual por um card de aviso claro: ícone + título *"Fotos indisponíveis"* + texto *"A GeckoAPI não conseguiu extrair fotos deste anúncio (comum em imóveis). Você pode tentar reimportar mais tarde — a página da OLX pode expor as fotos em outro momento."*
   - Botão **"Reimportar anúncio"** que dispara a Edge Function `import-olx-listing` só com essa URL e, ao terminar, invalida a query da página. Reutiliza o fluxo de polling já existente em `/import`.
   - Botão **"Ver fotos na OLX"** apontando para `source_url`.

### Tela de Listagem (`src/routes/_authenticated/listings.index.tsx`)

- Nos cards que estiverem com `images = 0`, colocar um pequeno badge *"Sem fotos"* no canto da miniatura placeholder, para o usuário identificar rapidamente.

### Componente reutilizável

- Criar `src/components/HashBadge.tsx` (badge + tooltip) usado em qualquer lugar que exiba hash de LGPD, para manter o texto/estilo consistente.

## Backend

Nenhuma mudança de schema ou de Edge Function. O upsert já preserva imagens antigas quando a nova extração vem vazia, e o campo `phone_hashes` já está sendo populado corretamente (só que a GeckoAPI devolveu `null` pra este anúncio).

## Fora de escopo

- Buscar telefone real por outra fonte (viola ToS/LGPD).
- Reprocessamento automático em background — por ora a reimportação é manual pelo botão.