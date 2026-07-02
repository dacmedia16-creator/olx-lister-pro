
CREATE TABLE public.photo_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Lote',
  mode text NOT NULL DEFAULT 'enhance' CHECK (mode IN ('enhance','watermark_only')),
  status text NOT NULL DEFAULT 'queued',
  image_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.photo_batches TO authenticated;
GRANT ALL ON public.photo_batches TO service_role;
ALTER TABLE public.photo_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own photo_batches" ON public.photo_batches FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_photo_batches_updated_at BEFORE UPDATE ON public.photo_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.photo_batch_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.photo_batches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  original_storage_path text NOT NULL,
  original_filename text,
  enhanced_storage_path text,
  enhancement_status text NOT NULL DEFAULT 'queued',
  error_message text,
  enhanced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_photo_batch_images_batch ON public.photo_batch_images(batch_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.photo_batch_images TO authenticated;
GRANT ALL ON public.photo_batch_images TO service_role;
ALTER TABLE public.photo_batch_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own photo_batch_images" ON public.photo_batch_images FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
