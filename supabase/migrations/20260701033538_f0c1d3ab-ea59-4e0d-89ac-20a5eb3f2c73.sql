
-- Enums
CREATE TYPE public.import_job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE public.listing_image_status AS ENUM ('pending', 'downloaded', 'failed');
CREATE TYPE public.log_type AS ENUM ('job', 'listing', 'image');
CREATE TYPE public.log_status AS ENUM ('success', 'error', 'warning', 'info');

-- updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- olx_import_jobs
CREATE TABLE public.olx_import_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.import_job_status NOT NULL DEFAULT 'pending',
  total_urls INT NOT NULL DEFAULT 0,
  processed_urls INT NOT NULL DEFAULT 0,
  successful_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.olx_import_jobs TO authenticated;
GRANT ALL ON public.olx_import_jobs TO service_role;
ALTER TABLE public.olx_import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jobs" ON public.olx_import_jobs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_jobs_user_created ON public.olx_import_jobs(user_id, created_at DESC);

-- olx_listings
CREATE TABLE public.olx_listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'olx.com.br',
  source_url TEXT NOT NULL,
  listing_id TEXT,
  ad_id TEXT,
  title TEXT,
  description TEXT,
  price NUMERIC(14,2),
  currency TEXT DEFAULT 'BRL',
  listed_at TIMESTAMPTZ,
  category TEXT,
  main_category TEXT,
  sub_category TEXT,
  state TEXT,
  city TEXT,
  neighborhood TEXT,
  region TEXT,
  ddd TEXT,
  zip_code TEXT,
  seller_id TEXT,
  seller_name_hash TEXT,
  seller_is_professional BOOLEAN,
  phone_hashes JSONB,
  attributes_json JSONB,
  olx_pay_enabled BOOLEAN,
  olx_delivery_enabled BOOLEAN,
  request_id TEXT,
  execution_id TEXT,
  extracted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_url)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.olx_listings TO authenticated;
GRANT ALL ON public.olx_listings TO service_role;
ALTER TABLE public.olx_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own listings" ON public.olx_listings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_listings_user_created ON public.olx_listings(user_id, created_at DESC);
CREATE INDEX idx_listings_city ON public.olx_listings(user_id, city);
CREATE INDEX idx_listings_category ON public.olx_listings(user_id, category);
CREATE INDEX idx_listings_price ON public.olx_listings(user_id, price);
CREATE TRIGGER trg_listings_updated_at BEFORE UPDATE ON public.olx_listings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- listing_images
CREATE TABLE public.listing_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.olx_listings(id) ON DELETE CASCADE,
  original_external_url TEXT NOT NULL,
  original_storage_path TEXT,
  status public.listing_image_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_images TO authenticated;
GRANT ALL ON public.listing_images TO service_role;
ALTER TABLE public.listing_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own images" ON public.listing_images FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_images_listing ON public.listing_images(listing_id);
CREATE TRIGGER trg_images_updated_at BEFORE UPDATE ON public.listing_images
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- processing_logs
CREATE TABLE public.processing_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.olx_import_jobs(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES public.olx_listings(id) ON DELETE SET NULL,
  image_id UUID REFERENCES public.listing_images(id) ON DELETE SET NULL,
  type public.log_type NOT NULL,
  status public.log_status NOT NULL,
  message TEXT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processing_logs TO authenticated;
GRANT ALL ON public.processing_logs TO service_role;
ALTER TABLE public.processing_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own logs" ON public.processing_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_logs_user_created ON public.processing_logs(user_id, created_at DESC);
CREATE INDEX idx_logs_job ON public.processing_logs(job_id);

-- Storage policies: olx-images bucket, path = {user_id}/...
CREATE POLICY "olx-images select own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'olx-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "olx-images insert own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'olx-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "olx-images update own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'olx-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "olx-images delete own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'olx-images' AND auth.uid()::text = (storage.foldername(name))[1]);
