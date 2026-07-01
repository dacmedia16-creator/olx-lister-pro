
ALTER TABLE public.olx_listings
  ADD COLUMN IF NOT EXISTS source_portal TEXT NOT NULL DEFAULT 'olx';

ALTER TABLE public.olx_listings
  DROP CONSTRAINT IF EXISTS olx_listings_source_portal_chk;
ALTER TABLE public.olx_listings
  ADD CONSTRAINT olx_listings_source_portal_chk CHECK (source_portal IN ('olx','zap'));

ALTER TABLE public.olx_import_jobs
  ADD COLUMN IF NOT EXISTS source_portal TEXT;

CREATE INDEX IF NOT EXISTS olx_listings_portal_created_at_idx
  ON public.olx_listings (source_portal, created_at DESC);
