// Edge Function: import-olx-listing
// Chama a GeckoAPI PDP para uma URL da OLX e persiste anúncio + URLs de fotos (sem baixar pro storage).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callGecko, extractPdpImageDiagnostics, extractPlpImages, mapGeckoStatusMessage } from "../_shared/gecko.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const GECKO_API_KEY = Deno.env.get("GECKO_API_KEY");

const OLX_URL_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*olx\.com\.br\//i;
const isValidOlxUrl = (u: string) => { try { return OLX_URL_RE.test(new URL(u).toString()); } catch { return false; } };

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getListingRoot(gecko: any): any {
  if (gecko?.data?.data && typeof gecko.data.data === "object") return gecko.data.data;
  if (gecko?.data && typeof gecko.data === "object") return gecko.data;
  return gecko ?? {};
}
function pick<T = any>(obj: any, keys: string[]): T | undefined {
  for (const k of keys) {
    const parts = k.split("."); let cur = obj; let ok = true;
    for (const p of parts) { if (cur && typeof cur === "object" && p in cur) cur = cur[p]; else { ok = false; break; } }
    if (ok && cur !== undefined && cur !== null) return cur as T;
  }
  return undefined;
}

function getPlpRoot(gecko: any): any {
  if (gecko?.data?.items && Array.isArray(gecko.data.items)) return gecko.data;
  if (gecko?.data?.data && typeof gecko.data.data === "object") return gecko.data.data;
  if (gecko?.data && typeof gecko.data === "object") return gecko.data;
  return gecko ?? {};
}

function extractAds(gecko: any): any[] {
  const root = getPlpRoot(gecko);
  for (const c of [root?.items, root?.ads, root?.listings, root?.results, gecko?.ads]) {
    if (Array.isArray(c) && c.length) return c;
  }
  return [];
}

function getAdUrl(ad: any): string {
  return String(ad?.url ?? ad?.link ?? ad?.href ?? "");
}

function getAdId(ad: any): string | null {
  const id = ad?.listingId ?? ad?.listing_id ?? ad?.adId ?? ad?.ad_id ?? ad?.id;
  return id == null ? null : String(id);
}

function normalizeOlxUrlForMatch(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return String(raw).split("?")[0].replace(/\/$/, "");
  }
}

function derivePlpFallbackUrl(sourceUrl: string): string | null {
  try {
    const u = new URL(sourceUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const last = parts[parts.length - 1] ?? "";
    const looksLikeListingSlug = /\d{8,}/.test(last) || last.includes("-");
    const plpParts = looksLikeListingSlug ? parts.slice(0, -1) : parts;
    if (plpParts.length === 0) return null;
    return `${u.origin}/${plpParts.join("/")}`;
  } catch {
    return null;
  }
}

async function fetchPlpFallbackImages(url: string, listingId: string | null, apiKey: string) {
  const plpUrl = derivePlpFallbackUrl(url);
  if (!plpUrl) return { urls: [] as string[], plpUrl: null as string | null, itemCount: 0, matched: false, requestId: null as string | null };

  const r = await callGecko(
    { target: "olx.com.br", type: "plp", url: plpUrl },
    { apiKey, label: "plp-image-fallback", retries: 1 },
  );
  if (!r.ok || r.body?.notFound === true) {
    return { urls: [] as string[], plpUrl, itemCount: 0, matched: false, requestId: r.requestId ?? null };
  }

  const ads = extractAds(r.body);
  const sourceMatch = normalizeOlxUrlForMatch(url);
  const matched = ads.find((ad) => {
    const adId = getAdId(ad);
    const adUrl = normalizeOlxUrlForMatch(getAdUrl(ad));
    return (listingId && adId === listingId) || (adUrl && sourceMatch && (adUrl === sourceMatch || sourceMatch.includes(adUrl) || adUrl.includes(sourceMatch)));
  });
  const target = matched ?? ads[0];
  return {
    urls: target ? extractPlpImages(target) : [],
    plpUrl,
    itemCount: ads.length,
    matched: Boolean(matched),
    requestId: r.requestId ?? r.body?.requestId ?? null,
  };
}

async function mapListing(user_id: string, source_url: string, gecko: any) {
  const d = getListingRoot(gecko);
  const seller = pick<any>(d, ["seller", "user", "advertiser"]) ?? {};
  const location = pick<any>(d, ["location", "address"]) ?? {};

  let phoneHashes: string[] = [];
  const preHashed = pick<any[]>(d, ["phoneHashes", "phone_hashes"]);
  if (Array.isArray(preHashed)) {
    phoneHashes = preHashed.filter((x) => typeof x === "string");
  } else {
    const rawPhones = pick<any[]>(d, ["seller.phones", "phones", "contact.phones"]) ?? [];
    phoneHashes = await Promise.all(
      rawPhones.map((p: any) => (typeof p === "string" ? p : p?.number || p?.phone)).filter(Boolean).map((p: string) => sha256(p)),
    );
  }

  let sellerHash: string | null = seller?.nameHash ?? seller?.name_hash ?? null;
  if (!sellerHash && (seller?.name || seller?.displayName)) {
    sellerHash = await sha256(String(seller.name ?? seller.displayName));
  }

  return {
    user_id, source: "olx.com.br", source_url,
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
    extracted_at: gecko?.data?.extractedAt ?? gecko?.extractedAt ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);
    if (!GECKO_API_KEY) return json({ error: "GECKO_API_KEY não configurada" }, 500);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
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
    if (invalid.length > 0) return json({ error: "URLs inválidas. Apenas olx.com.br é permitido.", invalid }, 400);

    const { data: jobIns, error: jobErr } = await userClient
      .from("olx_import_jobs")
      .insert({ user_id, status: "processing", total_urls: urls.length })
      .select().single();
    if (jobErr) return json({ error: jobErr.message }, 500);
    const jobId = jobIns.id;

    let successful = 0, failed = 0, notFoundCount = 0;
    const importedListingIds: Record<string, string> = {};

    for (const url of urls) {
      try {
        const pdp = await callGecko(
          { target: "olx.com.br", type: "pdp", url },
          { apiKey: GECKO_API_KEY, label: "pdp-import" },
        );

        if (!pdp.ok) {
          const msg = mapGeckoStatusMessage(pdp.status || 500);
          failed++;
          await userClient.from("processing_logs").insert({
            user_id, job_id: jobId, type: "listing", status: "error",
            message: msg, metadata_json: { url, http_status: pdp.status, attempts: pdp.attempts },
          });
          continue;
        }
        const gecko = pdp.body;
        if (gecko?.notFound === true) {
          notFoundCount++; failed++;
          await userClient.from("processing_logs").insert({
            user_id, job_id: jobId, type: "listing", status: "warning",
            message: "Anúncio não encontrado", metadata_json: { url },
          });
          continue;
        }

        const mapped = await mapListing(user_id, url, gecko);

        // Extração de fotos: campos oficiais + varredura profunda; tenta 1x mais se vier pouco.
        let imageDiagnostics = extractPdpImageDiagnostics(gecko);
        let imageUrls = imageDiagnostics.urls;
        let imageSource = imageUrls.length > 0 ? "pdp" : "none";
        let plpFallback: Awaited<ReturnType<typeof fetchPlpFallbackImages>> | null = null;
        if (imageUrls.length < 3) {
          const retry = await callGecko(
            { target: "olx.com.br", type: "pdp", url },
            { apiKey: GECKO_API_KEY, label: "pdp-import-retry", retries: 1 },
          );
          if (retry.ok) {
            const retryDiagnostics = extractPdpImageDiagnostics(retry.body);
            if (retryDiagnostics.urls.length > imageUrls.length) {
              imageDiagnostics = retryDiagnostics;
              imageUrls = retryDiagnostics.urls;
              imageSource = "pdp_retry";
            }
          }
        }

        if (imageUrls.length === 0) {
          plpFallback = await fetchPlpFallbackImages(url, mapped.listing_id, GECKO_API_KEY);
          if (plpFallback.urls.length > 0) {
            imageUrls = plpFallback.urls;
            imageSource = "plp_fallback";
          }
        }

        // Diagnóstico da resposta PDP (primeira execução por URL)
        const listingRoot = getListingRoot(gecko);
        await userClient.from("processing_logs").insert({
          user_id, job_id: jobId, type: "listing", status: "success",
          message: `PDP diagnóstico: ${imageUrls.length} foto(s)`,
          metadata_json: {
            url, request_id: gecko?.requestId,
            image_source: imageSource,
            image_counts: {
              total: imageUrls.length,
              pdp_fields: imageDiagnostics.fieldImages.length,
              pdp_deep_scan: imageDiagnostics.deepImages.length,
              plp_fallback: plpFallback?.urls.length ?? 0,
            },
            plp_fallback: plpFallback ? {
              url: plpFallback.plpUrl,
              item_count: plpFallback.itemCount,
              matched_listing: plpFallback.matched,
              request_id: plpFallback.requestId,
            } : null,
            image_fields: {
              images: Array.isArray(listingRoot?.images) ? listingRoot.images.slice(0, 3) : listingRoot?.images ?? null,
              photos: Array.isArray(listingRoot?.photos) ? listingRoot.photos.slice(0, 3) : listingRoot?.photos ?? null,
              media: Array.isArray(listingRoot?.media) ? listingRoot.media.slice(0, 3) : listingRoot?.media ?? null,
              thumbnail: listingRoot?.thumbnail ?? null,
              image: listingRoot?.image ?? null,
            },
            root_keys: listingRoot && typeof listingRoot === "object" ? Object.keys(listingRoot) : null,
          },
        });

        if (!mapped.title) {
          await userClient.from("processing_logs").insert({
            user_id, job_id: jobId, type: "listing", status: "warning",
            message: "Anúncio retornou sem título",
            metadata_json: { url, gecko_data_keys: gecko?.data && typeof gecko.data === "object" ? Object.keys(gecko.data) : null },
          });
        }

        const { data: listingRow, error: upErr } = await userClient
          .from("olx_listings")
          .upsert(mapped, { onConflict: "user_id,source_url" })
          .select().single();
        if (upErr) {
          failed++;
          await userClient.from("processing_logs").insert({
            user_id, job_id: jobId, type: "listing", status: "error",
            message: upErr.message, metadata_json: { url },
          });
          continue;
        }
        importedListingIds[url] = listingRow.id;

        if (imageUrls.length === 0) {
          await userClient.from("processing_logs").insert({
            user_id, job_id: jobId, listing_id: listingRow.id,
            type: "image", status: "warning",
            message: "GeckoAPI retornou 0 imagens em PDP e fallback PLP; imagens anteriores preservadas",
            metadata_json: { url, image_source: imageSource, plp_fallback: plpFallback },
          });
        } else {
          await userClient.from("listing_images").delete().eq("listing_id", listingRow.id);
          const rows = imageUrls.map((u, i) => ({
            user_id, listing_id: listingRow.id,
            original_external_url: u, status: "ready", position: i,
          }));
          const { error: insErr } = await userClient.from("listing_images").insert(rows);
          if (insErr) {
            await userClient.from("processing_logs").insert({
              user_id, job_id: jobId, listing_id: listingRow.id,
              type: "image", status: "error",
              message: insErr.message, metadata_json: { url, count: imageUrls.length },
            });
          }
        }

        successful++;
        await userClient.from("processing_logs").insert({
          user_id, job_id: jobId, listing_id: listingRow.id,
          type: "listing", status: "success",
          message: "Anúncio importado", metadata_json: { url, images: imageUrls.length, image_source: imageSource },
        });
      } catch (e: any) {
        failed++;
        await userClient.from("processing_logs").insert({
          user_id, job_id: jobId, type: "listing", status: "error",
          message: String(e?.message ?? e), metadata_json: { url },
        });
      } finally {
        await userClient.from("olx_import_jobs")
          .update({ processed_urls: successful + failed }).eq("id", jobId);
      }
    }

    for (const [url, listingId] of Object.entries(importedListingIds)) {
      await userClient.from("olx_search_results")
        .update({ imported_listing_id: listingId })
        .eq("user_id", user_id).eq("source_url", url);
    }

    await userClient.from("olx_import_jobs").update({
      status: "completed",
      successful_count: successful, failed_count: failed,
      processed_urls: successful + failed,
      finished_at: new Date().toISOString(),
    }).eq("id", jobId);

    return json({ jobId, job_id: jobId, successful, failed, notFound: notFoundCount });
  } catch (e: any) {
    console.error(e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
