
## Objetivo

Permitir importar anúncios do ZAP Imóveis (`zapimoveis.com.br`) usando a GeckoAPI PDP, no mesmo fluxo já existente para OLX, reaproveitando tabelas, storage, tratamento de fotos com IA e telas de listagem/detalhes.

## Detecção de portal

Novo helper `src/lib/portals.ts` (e cópia em `supabase/functions/_shared/portals.ts`):
- `detectPortal(url)` → `"olx" | "zap" | null`
- Regex ZAP: `^https?:\/\/(?:[a-z0-9-]+\.)?zapimoveis\.com\.br\/`
- `isValidListingUrl(url)` aceita OLX ou ZAP.

Atualizar `src/lib/olx.ts` (ou substituir por `portals.ts`) e a tela `import.tsx` para validar ambos os domínios e ajustar textos ("Importar anúncios OLX / ZAP", placeholder com exemplo dos dois).

## Banco

Migração:
- `ALTER TABLE olx_listings ADD COLUMN source_portal TEXT NOT NULL DEFAULT 'olx' CHECK (source_portal IN ('olx','zap'));`
- `ALTER TABLE olx_import_jobs ADD COLUMN source_portal TEXT;` (informativo, pode ser misto)
- Índice em `(source_portal, created_at desc)`.

Mantemos o nome `olx_listings` para não quebrar o resto do app; o portal fica na coluna. Nenhuma nova tabela.

## Edge Function `import-olx-listing`

Renomear internamente para atuar como "import-listing" sem trocar o nome da função (evita quebrar frontend/config):

1. Para cada URL recebida:
   - `portal = detectPortal(url)`; se `null` → registrar falha "URL não suportada".
   - Montar payload GeckoAPI:
     - OLX: `{ type: "olx.com.br/pdp", url }` (como hoje).
     - ZAP: `{ type: "zapimoveis.com.br/pdp", url }` conforme docs.
   - Chamar `callGecko` (já existe em `_shared/gecko.ts`).
2. Mapeamento ZAP → colunas de `olx_listings`:
   - `title` ← `data.title`
   - `price` ← `data.price` (numérico; parse "R$ 000.000")
   - `description` ← `data.description`
   - `location` ← `data.address` / `data.location`
   - `category` ← `data.category` / `"imovel"`
   - `seller_name_hash`, `seller_phone_hash` ← quando existirem (LGPD, iguais à OLX)
   - `source_portal = 'zap'`, `source_url = url`, `external_id` do payload
   - Campos específicos de imóvel (área, quartos, banheiros, vagas) já existem? Se sim, popular; se faltar, guardar no JSON `raw_payload`.
3. Fotos: mesmo pipeline atual (`extractPdpImages` genérico já busca `images/photos/media/gallery/...` — funciona para ZAP; deep scan permanece). Mantém limite 40, `original_external_url` e download opcional.
4. Fallback PLP: só OLX por enquanto (ZAP PLP fica fora do escopo desta iteração — evita crescer demais).

## Frontend

- `import.tsx`: validação aceita OLX + ZAP, textos e placeholder atualizados.
- `listings.index.tsx`: adicionar badge do portal (OLX/ZAP) em cada card e filtro por portal (select simples).
- `listings.$id.tsx`: mostrar badge do portal ao lado do título e link "Ver no ZAP" quando aplicável.
- `dashboard.tsx`: adicionar contador "ZAP importados" ao lado de OLX.

Tratamento de fotos com IA, exclusão de anúncio/foto, retratar individual — sem mudanças, já são agnósticos.

## Fora do escopo (desta iteração)

- Busca por filtros (PLP) do ZAP.
- Novos hashes/campos específicos que não existam no schema atual (irão em `raw_payload`).
- Renomear tabelas/funcões (`olx_*`) para nomes genéricos — trocaria muito código sem ganho funcional.

## Deploy

Migração + redeploy de `import-olx-listing`. Frontend recompila automaticamente.

## Confirmações antes de implementar

1. Manter o nome da Edge Function como `import-olx-listing` (aceita OLX+ZAP) para não quebrar chamadas existentes — ok?
2. Nesta fase só PDP do ZAP (importação por link individual), sem busca por filtros — ok?
