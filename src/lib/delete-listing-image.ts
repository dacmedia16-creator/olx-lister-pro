import { supabase } from "@/integrations/supabase/client";

/**
 * Deletes a single listing image owned by the current user.
 * Removes any storage objects (original + enhanced) then deletes the row.
 * RLS on listing_images ensures the caller can only touch their own images.
 */
export async function deleteListingImage(imageId: string): Promise<void> {
  const { data: img, error: fetchErr } = await supabase
    .from("listing_images")
    .select("original_storage_path,enhanced_storage_path")
    .eq("id", imageId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  const paths: string[] = [];
  if (img?.original_storage_path) paths.push(img.original_storage_path);
  if (img?.enhanced_storage_path) paths.push(img.enhanced_storage_path);
  if (paths.length > 0) {
    await supabase.storage.from("olx-images").remove(paths);
  }

  const { error } = await supabase.from("listing_images").delete().eq("id", imageId);
  if (error) throw error;
}
