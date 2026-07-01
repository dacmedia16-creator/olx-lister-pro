import { supabase } from "@/integrations/supabase/client";

/**
 * Deletes an OLX listing owned by the current user.
 * Attempts to remove any images stored in the `olx-images` bucket first,
 * then deletes the listing row (cascade removes listing_images and
 * sets olx_search_results.imported_listing_id to NULL).
 */
export async function deleteListing(listingId: string): Promise<void> {
  const { data: imgs } = await supabase
    .from("listing_images")
    .select("original_storage_path,enhanced_storage_path")
    .eq("listing_id", listingId);

  const paths: string[] = [];
  for (const im of (imgs ?? []) as Array<{
    original_storage_path: string | null;
    enhanced_storage_path: string | null;
  }>) {
    if (im.original_storage_path) paths.push(im.original_storage_path);
    if (im.enhanced_storage_path) paths.push(im.enhanced_storage_path);
  }
  if (paths.length > 0) {
    // Best-effort; ignore storage errors so the DB delete still runs.
    await supabase.storage.from("olx-images").remove(paths);
  }

  const { error } = await supabase.from("olx_listings").delete().eq("id", listingId);
  if (error) throw error;
}
