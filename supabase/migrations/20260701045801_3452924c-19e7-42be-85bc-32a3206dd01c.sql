
ALTER TABLE public.olx_listings
  ADD COLUMN IF NOT EXISTS images_source text;

-- Remove imagens salvas via fallback PLP que não casaram com o anúncio,
-- baseado no último log de diagnóstico por anúncio.
WITH latest_logs AS (
  SELECT DISTINCT ON (listing_id) listing_id, metadata_json
  FROM public.processing_logs
  WHERE type = 'listing' AND listing_id IS NOT NULL
  ORDER BY listing_id, created_at DESC
)
DELETE FROM public.listing_images li
USING latest_logs ll
WHERE li.listing_id = ll.listing_id
  AND ll.metadata_json ->> 'image_source' = 'plp_fallback'
  AND COALESCE((ll.metadata_json -> 'plp_fallback' ->> 'matched_listing')::boolean, false) = false;
