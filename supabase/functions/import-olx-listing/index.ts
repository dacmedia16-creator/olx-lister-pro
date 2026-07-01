// Edge Function: import-olx-listing
// Recebe URLs de anúncios OLX, chama a GeckoAPI, salva no banco e baixa imagens.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GECKO_API_KEY = Deno.env.get("GECKO_API_KEY");
const GECKO_ENDPOINT = "https://api.geckoapi.com.br/v1/extract";
const BUCKET = "olx-images";

const OLX_URL_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*olx\.com\.br\//i;

function isValidOlxUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return OLX_URL_RE.test(parsed.toString());
  } catch {
    return false;
  }
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extFromUrl(url: string, contentType?: string | null): string {
  if (contentType?.includes("jpeg")) return "jpg";
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("gif")) return "gif";
  const m = url.match(/\.(jpg|jpeg|png|webp|gif)(?:\?|$)/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

function mapGeckoStatusMessage(status: number): string {
  if (status === 400) return "Payload inválido ou URL inválida";
  if (status === 401) return "Chave da GeckoAPI inválida ou ausente";
  if (status === 402) return "Créditos insuficientes na GeckoAPI";
  if (status === 403) return "Acesso negado à API";
  if (status === 409) return "Conflito de execução";
  if (status === 429) return "Limite de requisições excedido";
  if (status >= 500) return "Erro temporário na GeckoAPI. Tente novamente";
  return `Erro HTTP ${status}`;
}

type GeckoResponse = {
  notFound?: boolean;
  requestId?: string;
  executionId?: string;
  extractedAt?: string;
  data?: any;
  [k: string]: any;
};

function pick<T = any>(obj: any, keys: string[]): T | undefined {
  for (const k of keys) {
    const parts = k.split(".");
    let cur = obj;
    let ok = true;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in cur) cur = cur[p];
      else { ok = false; break; }
    }
    if (ok && cur !== undefined && cur !== null) return cur as T;
  }
  return undefined;
}

async function extractImageUrls(payload: any): Promise<string[]> {
  const candidates: any[] = [
    payload?.images,
    payload?.photos,
    payload?.data?.images,
    payload?.data?.photos,
    payload?.data?.ad?.images,
    payload?.data?.listing?.images,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) {
      return c
        .map((item: any) =>
          typeof item === "string"
            ? item
            : item?.url || item?.original || item?.src || item?.href,
        )
        .filter((u: any) => typeof u === "string" && u.startsWith("http"));
    }
  }
  return [];
}

async function mapListing(user_id: string, source_url: string, gecko: GeckoResponse) {
  const d = gecko?.data ?? gecko;
  const seller = pick<any>(d, ["seller", "user", "advertiser", "data.seller"]) ?? {};
  const location = pick<any>(d, ["location", "address", "data.location"]) ?? {};
  const phones: any[] =
    pick<any[]>(d, ["seller.phones", "phones", "contact.phones"]) ?? [];
  const phoneHashes = await Promise.all(
    (Array.isArray(phones) ? phones : [])
      .map((p: any) => (typeof p === "string" ? p : p?.number || p?.phone))
      .filter(Boolean)
      .map((p: string) => sha256(p)),
  );
  const sellerName = seller?.name || seller?.displayName;
  const sellerHash = sellerName ? await sha256(String(sellerName)) : null;

  return {
    user_id,
    source: "olx.com.br",
    source_url,
    listing_id: pick<string>(d, ["listingId", "listing_id", "id"]) ?? null,
    ad_id: pick<string>(d, ["adId", "ad_id"]) ?? null,
    title: pick<string>(d, ["title", "name"]) ?? null,
    description: pick<string>(d, ["description", "body"]) ?? null,
    price: pick<number>(d, ["price.value", "price", "priceValue"]) ?? null,
    currency: pick<string>(d, ["price.currency", "currency"]) ?? "BRL",
    listed_at: pick<string>(d, ["listedAt", "listed_at", "publishedAt", "createdAt"]) ?? null,
    category: pick<string>(d, ["category", "categoryName"]) ?? null,
    main_category: pick<string>(d, ["mainCategory", "main_category"]) ?? null,
    sub_category: pick<string>(d, ["subCategory", "sub_category"]) ?? null,
    state: pick<string>(location, ["state", "uf"]) ?? null,
    city: pick<string>(location, ["city", "municipality"]) ?? null,
    neighborhood: pick<string>(location, ["neighborhood", "neighbourhood", "district"]) ?? null,
    region: pick<string>(location, ["region"]) ?? null,
    ddd: pick<string>(location, ["ddd"]) ?? null,
    zip_code: pick<string>(location, ["zipCode", "zip_code", "postalCode"]) ?? null,
    seller_id: seller?.id ? String(seller.id) : null,
    seller_name_hash: sellerHash,
    seller_is_professional: seller?.isProfessional ?? seller?.professional ?? null,
    phone_hashes: phoneHashes.length ? phoneHashes : null,
    attributes_json: pick<any>(d, ["attributes", "properties", "specs"]) ?? null,
    olx_pay_enabled: pick<boolean>(d, ["olxPay", "olx_pay", "olxPayEnabled"]) ?? null,
    olx_delivery_enabled: pick<boolean>(d, ["olxDelivery", "olx_delivery", "olxDeliveryEnabled"]) ?? null,
    request_id: gecko?.requestId ?? null,
    execution_id: gecko?.executionId ?? null,
    extracted_at: gecko?.extractedAt ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Não autenticado" }, 401);
    }

    if (!GECKO_API_KEY) {
      return json({ error: "GECKO_API_KEY não configurada" }, 500);
    }

    // Client como usuário (respeita RLS) para inserts do banco
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Admin para storage
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Sessão inválida" }, 401);
    const user_id = userData.user.id;

    const body = await req.json().catch(() => null);
    let urls: string[] = [];
    if (body?.url && typeof body.url === "string") urls.push(body.url);
    if (Array.isArray(body?.urls)) urls.push(...body.urls.filter((x: any) => typeof x === "string"));
    urls = Array.from(new Set(urls.map((u: string) => u.trim()).filter(Boolean)));

    if (urls.length === 0) return json({ error: "Nenhuma URL enviada" }, 400);
    const invalid = urls.filter((u) => !isValidOlxUrl(u));
    if (invalid.length > 0) {
      return json({ error: "URLs inválidas. Apenas olx.com.br é permitido.", invalid }, 400);
    }

    // Cria job
    const { data: jobIns, error: jobErr } = await userClient
      .from("olx_import_jobs")
      .insert({ user_id, status: "processing", total_urls: urls.length })
      .select()
      .single();
    if (jobErr) return json({ error: jobErr.message }, 500);
    const jobId = jobIns.id;

    let successful = 0;
    let failed = 0;
    let notFoundCount = 0;

    for (const url of urls) {
      try {
        const resp = await fetch(GECKO_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GECKO_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ target: "olx.com.br", type: "pdp", url }),
        });

        if (!resp.ok) {
          const msg = mapGeckoStatusMessage(resp.status);
          failed++;
          await userClient.from("processing_logs").insert({
            user_id, job_id: jobId, type: "listing", status: "error",
            message: msg, metadata_json: { url, http_status: resp.status },
          });
          continue;
        }

        const gecko = (await resp.json()) as GeckoResponse;

        if (gecko?.notFound === true) {
          notFoundCount++;
          failed++;
          await userClient.from("processing_logs").insert({
            user_id, job_id: jobId, type: "listing", status: "warning",
            message: "Anúncio não encontrado", metadata_json: { url },
          });
          continue;
        }

        const mapped = await mapListing(user_id, url, gecko);
        const { data: listingRow, error: upErr } = await userClient
          .from("olx_listings")
          .upsert(mapped, { onConflict: "user_id,source_url" })
          .select()
          .single();
        if (upErr) {
          failed++;
          await userClient.from("processing_logs").insert({
            user_id, job_id: jobId, type: "listing", status: "error",
            message: upErr.message, metadata_json: { url },
          });
          continue;
        }

        // Imagens
        const imageUrls = await extractImageUrls(gecko);
        // remove imagens antigas do listing para evitar duplicidade
        await userClient.from("listing_images").delete().eq("listing_id", listingRow.id);

        for (let i = 0; i < imageUrls.length; i++) {
          const imgUrl = imageUrls[i];
          const { data: imgRow, error: imgErr } = await userClient
            .from("listing_images")
            .insert({
              user_id, listing_id: listingRow.id,
              original_external_url: imgUrl, status: "pending", position: i,
            })
            .select()
            .single();
          if (imgErr || !imgRow) continue;

          try {
            const imgResp = await fetch(imgUrl);
            if (!imgResp.ok) throw new Error(`HTTP ${imgResp.status}`);
            const ct = imgResp.headers.get("content-type");
            const ext = extFromUrl(imgUrl, ct);
            const buf = new Uint8Array(await imgResp.arrayBuffer());
            const path = `${user_id}/${listingRow.id}/${imgRow.id}.${ext}`;
            const { error: upErr2 } = await admin.storage
              .from(BUCKET)
              .upload(path, buf, {
                contentType: ct ?? `image/${ext}`,
                upsert: true,
              });
            if (upErr2) throw upErr2;
            await userClient.from("listing_images").update({
              status: "downloaded", original_storage_path: path,
            }).eq("id", imgRow.id);
          } catch (e: any) {
            await userClient.from("listing_images").update({
              status: "failed", error_message: String(e?.message ?? e),
            }).eq("id", imgRow.id);
            await userClient.from("processing_logs").insert({
              user_id, job_id: jobId, listing_id: listingRow.id, image_id: imgRow.id,
              type: "image", status: "error",
              message: String(e?.message ?? e), metadata_json: { url: imgUrl },
            });
          }
        }

        successful++;
        await userClient.from("processing_logs").insert({
          user_id, job_id: jobId, listing_id: listingRow.id,
          type: "listing", status: "success",
          message: "Anúncio importado", metadata_json: { url, images: imageUrls.length },
        });
      } catch (e: any) {
        failed++;
        await userClient.from("processing_logs").insert({
          user_id, job_id: jobId, type: "listing", status: "error",
          message: String(e?.message ?? e), metadata_json: { url },
        });
      } finally {
        await userClient
          .from("olx_import_jobs")
          .update({ processed_urls: successful + failed })
          .eq("id", jobId);
      }
    }

    await userClient
      .from("olx_import_jobs")
      .update({
        status: "completed",
        successful_count: successful,
        failed_count: failed,
        processed_urls: successful + failed,
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return json({ jobId, successful, failed, notFound: notFoundCount });
  } catch (e: any) {
    console.error(e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
