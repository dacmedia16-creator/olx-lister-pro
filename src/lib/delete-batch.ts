import { supabase } from "@/integrations/supabase/client";

export async function deleteBatch(batchId: string): Promise<void> {
  const { data: imgs } = await supabase
    .from("photo_batch_images")
    .select("original_storage_path,enhanced_storage_path")
    .eq("batch_id", batchId);

  const paths: string[] = [];
  for (const im of (imgs ?? []) as Array<{ original_storage_path: string | null; enhanced_storage_path: string | null }>) {
    if (im.original_storage_path) paths.push(im.original_storage_path);
    if (im.enhanced_storage_path) paths.push(im.enhanced_storage_path);
  }
  if (paths.length > 0) await supabase.storage.from("olx-images").remove(paths);

  const { error } = await supabase.from("photo_batches").delete().eq("id", batchId);
  if (error) throw error;
}

export async function deleteBatchImage(imageId: string): Promise<void> {
  const { data: img } = await supabase
    .from("photo_batch_images")
    .select("original_storage_path,enhanced_storage_path")
    .eq("id", imageId)
    .maybeSingle();
  const paths: string[] = [];
  if (img?.original_storage_path) paths.push(img.original_storage_path);
  if (img?.enhanced_storage_path) paths.push(img.enhanced_storage_path);
  if (paths.length > 0) await supabase.storage.from("olx-images").remove(paths);
  const { error } = await supabase.from("photo_batch_images").delete().eq("id", imageId);
  if (error) throw error;
}
