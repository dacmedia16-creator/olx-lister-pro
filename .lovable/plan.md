# MVP Importador OLX via GeckoAPI

## Visão geral
Sistema autenticado onde o usuário cola URLs da OLX, uma Edge Function chama a GeckoAPI (`POST /v1/extract`, `type=pdp`), salva os dados no banco, baixa as imagens para o Storage e exibe tudo em uma UI organizada com filtros e detalhes.

## 1. Infraestrutura (Lovable Cloud)
- Ativar Lovable Cloud (Supabase gerenciado).
- Secret: `GECKO_API_KEY` (adicionada via secure form, nunca no frontend).
- Storage bucket **privado** `olx-images`, arquivos organizados como `{user_id}/{listing_id}/{image_id}.jpg`.
- RLS habilitado em todas as tabelas; policies restringindo por `auth.uid() = user_id`.
- Policies de Storage: usuário só lê/escreve objetos cujo primeiro segmento do path é seu `user_id`.

## 2. Banco de dados (migrations)
Tabelas conforme especificado:
- `profiles` (auto-criada via trigger `on_auth_user_created`).
- `olx_import_jobs` — status enum: `pending | processing | completed | failed`.
- `olx_listings` — unique constraint `(user_id, source_url)` para deduplicação; índices em `listing_id`, `ad_id`, `city`, `category`, `price`.
- `listing_images` — status enum: `pending | downloaded | failed`.
- `processing_logs` — type: `job | listing | image`; status: `success | error | warning`.

Todas com `GRANT` para `authenticated` + `service_role`, RLS ON, policies `user_id = auth.uid()` para SELECT/INSERT/UPDATE/DELETE.

## 3. Edge Function `import-olx-listing`
Fluxo:
1. Autenticar via JWT do chamador (usar client Supabase com token do usuário para inserts respeitando RLS; usar service role só para baixar/subir imagens no bucket privado).
2. Validar payload: array de URLs, cada uma deve casar `^https?://(www\.)?olx\.com\.br/`.
3. Criar `olx_import_jobs` com `status=processing`, `total_urls=N`.
4. Para cada URL (processamento sequencial com pequeno delay p/ evitar 429):
   - Chamar `POST https://api.geckoapi.com.br/v1/extract` com bearer `GECKO_API_KEY` e body `{target, type:"pdp", url}`.
   - Mapear status HTTP para mensagens (400/401/402/403/409/429/5xx) e gravar em `processing_logs`.
   - Se `notFound === true`: log "Anúncio não encontrado", incrementa `failed_count`, segue.
   - Se sucesso: upsert em `olx_listings` (dedupe por `source_url`), salvar `request_id`, `execution_id`, `extracted_at`, atributos em `attributes_json`, hashes do vendedor/telefones (SHA-256).
   - Inserir linhas em `listing_images` com `original_external_url`, status `pending`.
   - Baixar cada imagem (fetch → arrayBuffer → `supabaseAdmin.storage.from('olx-images').upload(path)`), atualizar `original_storage_path` e status `downloaded` (ou `failed` + `error_message`).
5. Atualizar job com contadores finais e `finished_at`.
6. Retornar resumo `{ jobId, successful, failed, notFound }`.

Erros técnicos são capturados e logados; a função sempre responde 200 com o resumo (erros por URL não derrubam o job inteiro).

## 4. Frontend (rotas TanStack Start)
- `/auth` — login/cadastro por email+senha (público).
- `/_authenticated/` — layout protegido (gerenciado pela integração).
  - `/dashboard` — cards: total de anúncios, total de imagens baixadas, últimos 5 anúncios, últimos 5 erros, botão "Importar anúncios OLX".
  - `/import` — textarea multi-URL + input single, botão Importar (chama server function que invoca a edge function), lista de jobs recentes com status em tempo real (polling ou refetch).
  - `/listings` — grid com foto principal, título, preço, cidade, bairro, categoria, data, status; filtros: cidade, bairro, categoria, faixa de preço, busca por título.
  - `/listings/$id` — detalhes: título, descrição, preço, localização, categoria, atributos (render do JSON), vendedor (apenas hashes), galeria com signed URLs do storage, link para URL original.

## 5. Segurança
- `GECKO_API_KEY` só existe no ambiente da Edge Function.
- Validação de domínio OLX no backend (regex) além do frontend.
- RLS em todas as tabelas + policies de Storage por prefixo `user_id/`.
- Imagens servidas via **signed URLs** de curta duração (bucket privado).
- Dados sensíveis do vendedor armazenados apenas como hash SHA-256.

## 6. Tratamento de erros (UI)
Mapeamento centralizado em `src/lib/gecko-errors.ts` das mensagens: 400 "Payload inválido ou URL inválida", 401 "Chave da GeckoAPI inválida ou ausente", 402 "Créditos insuficientes na GeckoAPI", 403 "Acesso negado à API", 409 "Conflito de execução", 429 "Limite de requisições excedido", 5xx "Erro temporário na GeckoAPI. Tente novamente", `notFound` "Anúncio não encontrado".

## Detalhes técnicos
- **Stack**: TanStack Start + Lovable Cloud (Supabase). Auth email/senha (posso adicionar Google se quiser).
- **Chamada da Edge Function**: via `supabase.functions.invoke('import-olx-listing', { body })` a partir de um `createServerFn` protegido com `requireSupabaseAuth` (mantém o JWT do usuário).
- **Design**: tokens semânticos em `src/styles.css`, tema claro/escuro, componentes shadcn (Card, Table, Dialog, Badge, Input, Textarea, Skeleton, Sonner para toasts).
- **Perguntas antes de implementar**:
  1. Login apenas email/senha, ou também Google?
  2. Ordem de importação: sequencial (mais seguro contra 429, mais lento) — confirma?
  3. Quer que eu já peça a `GECKO_API_KEY` no início da implementação (via secure form)?

Confirme para eu implementar.
