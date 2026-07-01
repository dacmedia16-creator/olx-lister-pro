import { supabase } from "@/integrations/supabase/client";

const BUCKET = "olx-images";

export async function getEnhancedSignedUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

async function forceDownload(url: string, filename: string) {
  const r = await fetch(url);
  const blob = await r.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
}

export async function downloadEnhanced(path: string, filename: string) {
  const url = await getEnhancedSignedUrl(path);
  if (!url) throw new Error("Não foi possível obter o link da foto");
  await forceDownload(url, filename);
}

export async function downloadEnhancedZip(items: { path: string; name: string }[], zipName: string) {
  const JSZipMod = await import("jszip");
  const JSZip = (JSZipMod as any).default ?? JSZipMod;
  const zip = new JSZip();
  for (const it of items) {
    const url = await getEnhancedSignedUrl(it.path);
    if (!url) continue;
    const r = await fetch(url);
    const blob = await r.blob();
    zip.file(it.name, blob);
  }
  const out = await zip.generateAsync({ type: "blob" });
  const objUrl = URL.createObjectURL(out);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
}
