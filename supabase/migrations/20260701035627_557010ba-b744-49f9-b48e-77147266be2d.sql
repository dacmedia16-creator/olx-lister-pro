
-- olx_searches
CREATE TABLE public.olx_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  keyword text,
  state text,
  city text,
  region text,
  category_path text,
  price_min numeric,
  price_max numeric,
  sort text,
  page integer DEFAULT 1,
  search_url text,
  request_id text,
  execution_id text,
  total_results integer,
  next_page integer,
  next_page_url text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.olx_searches TO authenticated;
GRANT ALL ON public.olx_searches TO service_role;
ALTER TABLE public.olx_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own searches" ON public.olx_searches FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_olx_searches_user ON public.olx_searches(user_id);
CREATE INDEX idx_olx_searches_created ON public.olx_searches(created_at DESC);

-- olx_search_results
CREATE TABLE public.olx_search_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  search_id uuid NOT NULL REFERENCES public.olx_searches(id) ON DELETE CASCADE,
  external_id text,
  source_url text NOT NULL,
  title text,
  category text,
  category_id text,
  condition text,
  price numeric,
  price_display text,
  featured boolean,
  professional_ad boolean,
  chat_enabled boolean,
  listed_at timestamptz,
  image_count integer,
  main_image_url text,
  city text,
  state text,
  neighborhood text,
  location_display text,
  properties_json jsonb,
  imported_listing_id uuid REFERENCES public.olx_listings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.olx_search_results TO authenticated;
GRANT ALL ON public.olx_search_results TO service_role;
ALTER TABLE public.olx_search_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own search results" ON public.olx_search_results FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_olx_search_results_user ON public.olx_search_results(user_id);
CREATE INDEX idx_olx_search_results_search ON public.olx_search_results(search_id);
CREATE INDEX idx_olx_search_results_city ON public.olx_search_results(city);
CREATE INDEX idx_olx_search_results_price ON public.olx_search_results(price);
CREATE INDEX idx_olx_search_results_created ON public.olx_search_results(created_at DESC);

-- listing_images: preparar para IA
ALTER TABLE public.listing_images
  ADD COLUMN IF NOT EXISTS enhanced_storage_path text,
  ADD COLUMN IF NOT EXISTS enhancement_status text,
  ADD COLUMN IF NOT EXISTS enhancement_prompt text,
  ADD COLUMN IF NOT EXISTS openai_response_id text,
  ADD COLUMN IF NOT EXISTS enhanced_at timestamptz;
