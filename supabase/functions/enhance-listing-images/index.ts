// Edge Function: enhance-listing-images
// Melhora as fotos de um anúncio via Lovable AI Gateway (OpenAI gpt-image-2 edits)
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decode as decodeImage, Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const BUCKET = "olx-images";
const PROMPT = "Melhore esta foto de imóvel e entregue no formato HORIZONTAL (paisagem, proporção aproximada 3:2). Se a foto original for vertical, faça outpainting realista estendendo naturalmente parede, piso, teto e iluminação para preencher todo o quadro horizontal. REGRAS: (1) NUNCA deixe faixas brancas, cinzas ou bordas nas laterais; (2) a imagem inteira deve parecer UMA FOTO ÚNICA e nítida; (3) NÃO invente móveis novos, NÃO mude cores, estilo ou iluminação do ambiente original; (4) apenas melhore nitidez e exposição e complete as laterais de forma coerente com o mesmo cômodo.";
const RETRY_PROMPT = PROMPT + " ATENÇÃO: a tentativa anterior deixou faixas brancas nas laterais — desta vez REMOVA COMPLETAMENTE qualquer área branca e substitua por continuação realista da parede/piso/teto.";
const MODEL = "openai/gpt-image-2";
const IMAGE_SIZE = "1536x1024"; // horizontal 3:2
const TARGET_W = 1536;
const TARGET_H = 1024;

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url, { headers: { "Referer": "https://www.olx.com.br/" } });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch { return null; }
}

// Fallback: encaixa foto em canvas horizontal 3:2 caso o modelo devolva com aspect errado.
async function toHorizontalCanvas(bytes: Uint8Array): Promise<Uint8Array> {
  const src = await decodeImage(bytes) as Image;
  const srcW = src.width, srcH = src.height;
  const targetRatio = TARGET_W / TARGET_H;
  const srcRatio = srcW / srcH;
  let drawW: number, drawH: number;
  if (srcRatio > targetRatio) { drawW = TARGET_W; drawH = Math.round(TARGET_W / srcRatio); }
  else { drawH = TARGET_H; drawW = Math.round(TARGET_H * srcRatio); }
  const resized = src.clone().resize(drawW, drawH);
  const canvas = new Image(TARGET_W, TARGET_H);
  const bg = src.clone().resize(TARGET_W, TARGET_H);
  try { (bg as any).blur(20); } catch { /* noop */ }
  canvas.composite(bg, 0, 0);
  const offX = Math.floor((TARGET_W - drawW) / 2);
  const offY = Math.floor((TARGET_H - drawH) / 2);
  canvas.composite(resized, offX, offY);
  return await canvas.encode();
}

async function callOpenAiImageEdit(imageBytes: Uint8Array, promptText: string): Promise<Uint8Array> {
  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", promptText);
  form.append("size", IMAGE_SIZE);
  form.append("quality", "low");
  form.append("n", "1");
  form.append("image", new Blob([imageBytes], { type: "image/png" }), "input.png");

  const r = await fetch("https://ai.gateway.lovable.dev/v1/images/edits", {
    method: "POST",
    headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}` },
    body: form,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    if (r.status === 429) throw new Error("Limite de requisições atingido (429). Tente novamente em instantes.");
    if (r.status === 402) throw new Error("Créditos de IA esgotados (402). Adicione créditos no workspace.");
    throw new Error(`Gateway error ${r.status}: ${text.slice(0, 400)}`);
  }
  const json = await r.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("Resposta sem imagem gerada");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Detecta faixas quase-brancas nas laterais.
async function hasWhiteSideBars(bytes: Uint8Array): Promise<boolean> {
  try {
    const img = await decodeImage(bytes) as Image;
    const w = img.width, h = img.height;
    const colL = Math.max(1, Math.floor(w * 0.02));
    const colR = Math.min(w - 1, Math.floor(w * 0.98));
    const samples = 20;
    let whites = 0, total = 0;
    for (let i = 0; i < samples; i++) {
      const y = Math.max(1, Math.floor((i + 0.5) * h / samples));
      for (const x of [colL, colR]) {
        const px = img.getPixelAt(x, y);
        const r = (px >>> 24) & 0xff, g = (px >>> 16) & 0xff, b = (px >>> 8) & 0xff;
        if (r > 245 && g > 245 && b > 245) whites++;
        total++;
      }
    }
    return total > 0 && whites / total > 0.7;
  } catch { return false; }
}

// Lê width/height direto do header PNG.
function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const listingId = body?.listing_id as string | undefined;
    const imageIds = Array.isArray(body?.image_ids) ? (body.image_ids as string[]) : null;
    if (!listingId) return new Response(JSON.stringify({ error: "listing_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: listing, error: lerr } = await admin.from("olx_listings").select("id,user_id").eq("id", listingId).maybeSingle();
    if (lerr || !listing || listing.user_id !== userId) {
      return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let q = admin.from("listing_images").select("id,original_external_url,enhancement_status").eq("listing_id", listingId);
    if (imageIds && imageIds.length) q = q.in("id", imageIds);
    const { data: imgs } = await q;
    const allTargets = (imgs ?? []).filter((i: any) => i.original_external_url);

    const MAX_PER_CALL = 2;
    const targets = allTargets.slice(0, MAX_PER_CALL);
    const remaining_ids = allTargets.slice(MAX_PER_CALL).map((t: any) => t.id);

    await admin.from("listing_images")
      .update({ enhancement_status: "processing", enhancement_prompt: PROMPT })
      .in("id", targets.map((t: any) => t.id));

    const TARGET_RATIO = TARGET_W / TARGET_H;
    const TOLERANCE = 0.05;

    const results: Array<{ id: string; ok: boolean; error?: string; original_ratio?: number; final_ratio?: number; was_corrected?: boolean; white_bars_detected?: boolean; retried?: boolean }> = [];
    for (const img of targets) {
      try {
        const srcBytes = await fetchBytes(img.original_external_url!);
        if (!srcBytes) throw new Error("Falha ao baixar imagem original");

        let bytes = await callOpenAiImageEdit(srcBytes, PROMPT);

        // Retry se faixas brancas
        let whiteBars = await hasWhiteSideBars(bytes);
        let retried = false;
        if (whiteBars) {
          try {
            const retryBytes = await callOpenAiImageEdit(srcBytes, RETRY_PROMPT);
            retried = true;
            const stillWhite = await hasWhiteSideBars(retryBytes);
            bytes = retryBytes;
            if (!stillWhite) whiteBars = false;
          } catch { /* mantém primeira tentativa */ }
        }

        // Valida aspect ratio; se torto, encaixa em canvas horizontal
        let originalRatio: number | undefined;
        let finalRatio: number | undefined;
        let wasCorrected = false;
        const size = readPngSize(bytes);
        if (size && size.height > 0) {
          originalRatio = size.width / size.height;
          const withinTol = Math.abs(originalRatio - TARGET_RATIO) / TARGET_RATIO <= TOLERANCE;
          if (!withinTol) {
            bytes = await toHorizontalCanvas(bytes);
            const sz2 = readPngSize(bytes);
            finalRatio = sz2 ? sz2.width / sz2.height : undefined;
            wasCorrected = true;
          } else {
            finalRatio = originalRatio;
          }
        }

        const path = `${userId}/enhanced/${listingId}/${img.id}.png`;
        const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
          contentType: "image/png",
          upsert: true,
        });
        if (upErr) throw new Error(upErr.message);
        await admin.from("listing_images").update({
          enhanced_storage_path: path,
          enhancement_status: "done",
          enhanced_at: new Date().toISOString(),
          error_message: null,
        }).eq("id", img.id);
        results.push({ id: img.id, ok: true, original_ratio: originalRatio, final_ratio: finalRatio, was_corrected: wasCorrected, white_bars_detected: whiteBars, retried });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin.from("listing_images").update({
          enhancement_status: "failed",
          error_message: msg.slice(0, 500),
        }).eq("id", img.id);
        results.push({ id: img.id, ok: false, error: msg });
      }
    }

    try {
      await admin.from("processing_logs").insert({
        user_id: userId,
        listing_id: listingId,
        type: "enhance_images",
        status: "done",
        message: `enhance-listing-images (${MODEL}): ${results.filter(r => r.ok).length}/${results.length} sucesso`,
        metadata_json: { model: MODEL, results },
      });
    } catch { /* noop */ }

    return new Response(JSON.stringify({ results, remaining_ids }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
