# Adicionar Viva Real como terceiro portal

Hoje o sistema aceita OLX e ZAP Imóveis. Vou adicionar **Viva Real** (`vivareal.com.br`) nos dois fluxos — importação por URL (PDP) e busca por filtros (PLP) — reaproveitando o pipeline já existente.

## 1. Detecção de portal (frontend + backend)

- `src/lib/portals.ts` e `supabase/functions/_shared/portals.ts`
  - Adicionar `"viva"` ao tipo `Portal`.
  - Nova regex `VIVA_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*vivareal\.com\.br\//i`.
  - `geckoPayloadFor("viva", url)` → `{ target: "vivareal.com.br", type: "pdp", url }`.
  - `geckoSourceLabel("viva")` → `"vivareal.com.br"`.
  - `PORTAL_LABEL.viva = "Viva Real"`.

## 2. Banco

- `source_portal` já é texto livre; nenhuma migração de schema necessária.
- Novo valor aceito: `"viva"`.

## 3. Edge Function `import-olx-listing` (PDP)

- Usar `detectPortal` para rotear entre OLX / ZAP / Viva.
- Para Viva, chamar Gecko com `target: "vivareal.com.br"`, `type: "pdp"`.
- Reaproveitar `extractPdpImages` (já faz varredura profunda + resolve placeholders `{action}/{width}x{height}` que o CDN `resizedimgs.vivareal.com` usa — mesma CDN do ZAP).
- Fallback PLP: quando o PDP retornar zero fotos, buscar na PLP do Viva usando cidade/bairro/keywords extraídos e casar por ID/URL — espelhando a lógica atual do ZAP.
- Log e `source_portal = "viva"` persistidos em `olx_listings`.

## 4. Edge Function `search-olx-listings` (PLP)

- Aceitar parâmetro `portal` no body (`"olx" | "zap" | "viva"`, default `"olx"` para retrocompatibilidade).
- Montar payload Gecko conforme portal:
  - Viva: `target: "vivareal.com.br"`, `type: "plp"`, com filtros documentados (keyword, state, city, neighborhood, priceMin/Max, page, sort).
- Enriquecimento PDP quando fotos < `MIN_IMAGES`: chamar PDP do mesmo portal.
- Validação de URL: aceitar URLs de `vivareal.com.br` quando `portal === "viva"`.

## 5. Frontend

- `src/routes/_authenticated/import.tsx`: mensagem de ajuda e validação já usam `detectPortal` → só atualizar textos ("OLX, ZAP Imóveis ou Viva Real").
- `src/routes/_authenticated/search.tsx`: adicionar seletor de portal (3 opções) e enviar `portal` ao invocar a função. Filtros compartilhados; rotular campos conforme portal quando necessário.
- `src/routes/_authenticated/listings.index.tsx` e `listings.$id.tsx`: incluir badge "Viva Real" (cor distinta) e adicionar `"viva"` ao filtro de portal.
- `OlxImageCarousel` já funciona para qualquer CDN (referrerPolicy no-referrer) — sem mudanças.

## 6. Verificação

- Testar 1 URL de anúncio Viva Real (PDP) e 1 busca com filtros (PLP).
- Confirmar que fotos são baixadas para o bucket `olx-images` e aparecem em Detalhes.

Nenhuma nova secret é necessária — a mesma `GECKO_API_KEY` cobre os três portais.