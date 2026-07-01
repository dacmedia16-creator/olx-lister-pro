// Edge Function: enhance-listing-images
// Melhora as fotos de um anúncio via Lovable AI Gateway (Gemini image edit)
// Prompt fixo: "Melhore a imagem sem mudar o ambiente, deixe na horizontal."
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
const PROMPT = "Melhore a foto do imóvel mantendo o ambiente real (paredes, piso, teto, móveis, iluminação). A imagem está em formato horizontal 16:9 com bordas brancas nas laterais — preencha essas bordas estendendo naturalmente o mesmo ambiente de forma coerente e realista, sem inventar móveis novos, sem mudar cores nem estilo. Resultado final deve ser sempre horizontal (paisagem).";
const TARGET_W = 1536;
const TARGET_H = 864;
const MODEL = "google/gemini-2.5-flash-image";

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url, { headers: { "Referer": "https://www.olx.com.br/" } });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch { return null; }
}

function bytesToDataUrl(bytes: Uint8Array, contentType: string): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return `data:${contentType};base64,${btoa(bin)}`;
}

// Converte qualquer foto em um canvas horizontal 16:9 (TARGET_W x TARGET_H) com letterbox branco.
// Isso força o Gemini a devolver saída horizontal (ele preserva o aspect ratio da entrada).
async function toHorizontalCanvas(bytes: Uint8Array): Promise<Uint8Array> {
  const decoded = await decodeImage(bytes);
  const src = decoded as Image;
  const srcW = src.width;
  const srcH = src.height;
  const targetRatio = TARGET_W / TARGET_H;
  const srcRatio = srcW / srcH;
  let drawW: number, drawH: number;
  if (srcRatio > targetRatio) {
    drawW = TARGET_W;
    drawH = Math.round(TARGET_W / srcRatio);
  } else {
    drawH = TARGET_H;
    drawW = Math.round(TARGET_H * srcRatio);
  }
  const resized = src.clone().resize(drawW, drawH);
  const canvas = new Image(TARGET_W, TARGET_H).fill(0xffffffff);
  const offX = Math.floor((TARGET_W - drawW) / 2);
  const offY = Math.floor((TARGET_H - drawH) / 2);
  canvas.composite(resized, offX, offY);
  return await canvas.encode(); // PNG
}

function extractImageB64FromResponse(json: any): string | null {
  // OpenRouter/Gemini image via chat.completions -> images array in message
  const choice = json?.choices?.[0]?.message;
  if (!choice) return null;
  const imgs = choice.images;
  if (Array.isArray(imgs) && imgs.length) {
    const u = imgs[0]?.image_url?.url ?? imgs[0]?.url ?? imgs[0];
    if (typeof u === "string" && u.startsWith("data:")) {
      const idx = u.indexOf(",");
      return idx >= 0 ? u.slice(idx + 1) : null;
    }
  }
  // Fallback: content parts
  const content = choice.content;
  if (Array.isArray(content)) {
    for (const p of content) {
      const u = p?.image_url?.url ?? p?.url;
      if (typeof u === "string" && u.startsWith("data:")) {
        const idx = u.indexOf(",");
        return idx >= 0 ? u.slice(idx + 1) : null;
      }
    }
  }
  return null;
}

async function callGeminiEdit(dataUrl: string): Promise<string> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      modalities: ["image", "text"],
      messages: [{
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      }],
    }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    if (r.status === 429) throw new Error("Limite de requisições atingido (429). Tente novamente em instantes.");
    if (r.status === 402) throw new Error("Créditos de IA esgotados (402). Adicione créditos no workspace.");
    throw new Error(`Gateway error ${r.status}: ${text.slice(0, 300)}`);
  }
  const json = await r.json();
  const b64 = extractImageB64FromResponse(json);
  if (!b64) throw new Error("Resposta sem imagem gerada");
  return b64;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
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

    // Verifica ownership
    const { data: listing, error: lerr } = await admin.from("olx_listings").select("id,user_id").eq("id", listingId).maybeSingle();
    if (lerr || !listing || listing.user_id !== userId) {
      return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let q = admin.from("listing_images").select("id,original_external_url,enhancement_status").eq("listing_id", listingId);
    if (imageIds && imageIds.length) q = q.in("id", imageIds);
    const { data: imgs } = await q;
    const targets = (imgs ?? []).filter((i: any) => i.original_external_url);

    // Marca todos como processing
    await admin.from("listing_images")
      .update({ enhancement_status: "processing", enhancement_prompt: PROMPT })
      .in("id", targets.map((t: any) => t.id));

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const img of targets) {
      try {
        const srcBytes = await fetchBytes(img.original_external_url!);
        if (!srcBytes) throw new Error("Falha ao baixar imagem original");
        const horizontalPng = await toHorizontalCanvas(srcBytes);
        const dataUrl = bytesToDataUrl(horizontalPng, "image/png");
        const b64 = await callGeminiEdit(dataUrl);
        const bytes = b64ToBytes(b64);
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
        results.push({ id: img.id, ok: true });
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
        message: `enhance-listing-images: ${results.filter(r => r.ok).length}/${results.length} sucesso`,
        metadata_json: { results },
      });
    } catch { /* noop */ }

    return new Response(JSON.stringify({ results }), {
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
