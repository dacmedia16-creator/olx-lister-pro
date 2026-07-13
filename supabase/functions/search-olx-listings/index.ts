// Edge Function: search-olx-listings
// GeckoAPI PLP + enriquecimento PDP para preencher fotos que a PLP não expõe.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  callGecko,
  extractPlpImages,
  extractPdpImages,
  mapGeckoStatusMessage,
  pmap,
} from "../_shared/gecko.ts";
import { detectPortal, geckoSourceLabel, type Portal } from "../_shared/portals.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const GECKO_API_KEY = Deno.env.get("GECKO_API_KEY");

const PORTAL_LABEL: Record<Portal, string> = { olx: "OLX", zap: "ZAP Imóveis", viva: "Viva Real" };

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
function pick<T = any>(obj: any, keys: string[]): T | undefined {
  for (const k of keys) {
    const parts = k.split("."); let cur = obj; let ok = true;
    for (const p of parts) { if (cur && typeof cur === "object" && p in cur) cur = cur[p]; else { ok = false; break; } }
    if (ok && cur !== undefined && cur !== null) return cur as T;
  }
  return undefined;
}

function mapAd(user_id: string, search_id: string, ad: any, image_urls: string[]) {
  const location = ad?.location ?? {};
  return {
    user_id, search_id,
    external_id: ad?.id ? String(ad.id) : pick<string>(ad, ["listingId", "adId"]) ?? null,
    source_url: ad?.url ?? ad?.link ?? ad?.href ?? "",
    title: ad?.title ?? ad?.subject ?? null,
    category: ad?.category ?? ad?.categoryName ?? null,
    category_id: ad?.categoryId ? String(ad.categoryId) : null,
    condition: ad?.condition ?? null,
    price: typeof ad?.price === "number" ? ad.price : (ad?.price?.value ?? null),
    price_display: ad?.priceDisplay ?? ad?.price?.display ?? (typeof ad?.price === "string" ? ad.price : null),
    featured: ad?.featured ?? null,
    professional_ad: ad?.professionalAd ?? ad?.professional ?? null,
    chat_enabled: ad?.chatEnabled ?? null,
    listed_at: ad?.listedAt ?? ad?.publishedAt ?? null,
    image_count: image_urls.length || (typeof ad?.imageCount === "number" ? ad.imageCount : (Array.isArray(ad?.images) ? ad.images.length : null)),
    main_image_url: image_urls[0] ?? null,
    image_urls,
    city: location?.city ?? ad?.city ?? null,
    state: location?.state ?? location?.uf ?? ad?.state ?? null,
    neighborhood: location?.neighborhood ?? location?.neighbourhood ?? null,
    location_display: location?.display ?? ad?.locationDisplay ?? null,
    properties_json: ad?.properties ?? ad?.attributes ?? null,
  };
}

const MIN_IMAGES = 3;
const MAX_PDP_ENRICH = 5;
const PDP_CONCURRENCY = 3;

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

    const body = await req.json().catch(() => ({} as any));
    const portalRaw = typeof body?.portal === "string" ? body.portal.toLowerCase() : "olx";
    const portal: Portal = portalRaw === "zap" ? "zap" : portalRaw === "viva" ? "viva" : "olx";
    const geckoTarget = geckoSourceLabel(portal);

    const payload: Record<string, any> = { target: geckoTarget, type: "plp" };
    if (typeof body?.url === "string" && body.url.trim()) {
      const detected = detectPortal(body.url);
      if (detected === null || detected !== portal) {
        return json({ error: `URL inválida. Esperado ${PORTAL_LABEL[portal]}.` }, 400);
      }
      payload.url = body.url.trim();
    } else {
      const opt = (k: string) => (body?.[k] !== undefined && body?.[k] !== "" && body?.[k] !== null) ? body[k] : undefined;
      const keyword = opt("keyword"), state = opt("state"), city = opt("city"), region = opt("region");
      const neighborhood = opt("neighborhood");
      const categoryPath = opt("categoryPath");
      const priceMin = opt("priceMin"), priceMax = opt("priceMax");
      const sort = opt("sort"); const page = opt("page");
      if (!state && !payload.url) {
        return json({ error: `${PORTAL_LABEL[portal]} PLP exige UF (state), ex.: SP.` }, 400);
      }
      if (keyword) payload.keyword = String(keyword);
      if (state) payload.state = String(state);
      if (city) payload.city = String(city);
      if (region) payload.region = String(region);
      if (neighborhood) payload.neighborhood = String(neighborhood);
      if (categoryPath) payload.categoryPath = String(categoryPath);
      if (priceMin !== undefined) payload.priceMin = Number(priceMin);
      if (priceMax !== undefined) payload.priceMax = Number(priceMax);
      if (sort) payload.sort = String(sort);
      payload.page = page !== undefined ? Number(page) : 1;
    }

    const { data: searchIns, error: sErr } = await userClient
      .from("olx_searches").insert({
        user_id, status: "processing",
        keyword: payload.keyword ?? null, state: payload.state ?? null, city: payload.city ?? null,
        region: payload.region ?? null, category_path: payload.categoryPath ?? null,
        price_min: payload.priceMin ?? null, price_max: payload.priceMax ?? null,
        sort: payload.sort ?? null, page: payload.page ?? null, search_url: payload.url ?? null,
      }).select().single();
    if (sErr) return json({ error: sErr.message }, 500);
    const search_id = searchIns.id;

    const plp = await callGecko(payload, { apiKey: GECKO_API_KEY, label: "plp" });
    if (!plp.ok) {
      const msg = mapGeckoStatusMessage(plp.status || 500);
      await userClient.from("olx_searches").update({ status: "failed", error_message: msg }).eq("id", search_id);
      await userClient.from("processing_logs").insert({
        user_id, type: "search", status: "error",
        message: msg, metadata_json: { search_id, http_status: plp.status, attempts: plp.attempts },
      });
      return json({ error: msg, search_id }, plp.status >= 500 ? 502 : (plp.status || 500));
    }

    const gecko = plp.body;
    if (gecko?.notFound === true) {
      await userClient.from("olx_searches").update({
        status: "completed", total_results: 0,
        request_id: gecko?.requestId ?? null, execution_id: gecko?.executionId ?? null,
      }).eq("id", search_id);
      return json({ search_id, results: [], total: 0, notFound: true });
    }

    const root = getPlpRoot(gecko);
    const ads = extractAds(gecko);

    // Diagnóstico: campos de imagem dos 3 primeiros itens
    const sample = ads.slice(0, 3).map((it: any) => ({
      keys: it && typeof it === "object" ? Object.keys(it) : null,
      images: it?.images, thumbnails: it?.thumbnails, photos: it?.photos,
      media: it?.media, thumbnail: it?.thumbnail, image: it?.image,
    }));
    await userClient.from("processing_logs").insert({
      user_id, type: "search", status: "success",
      message: `PLP diagnóstico: ${ads.length} itens, campos de imagem dos 3 primeiros`,
      metadata_json: { search_id, request_id: gecko?.requestId, sample_image_fields: sample },
    });

    // Extrai PLP images e identifica top-N que precisam de enriquecimento PDP
    const plpImagesByIdx = ads.map(extractPlpImages);
    const toEnrichIdx: number[] = [];
    for (let i = 0; i < ads.length && toEnrichIdx.length < MAX_PDP_ENRICH; i++) {
      if (plpImagesByIdx[i].length < MIN_IMAGES && typeof ads[i]?.url === "string") {
        toEnrichIdx.push(i);
      }
    }

    const pdpImages: Record<number, string[]> = {};
    if (toEnrichIdx.length > 0) {
      await pmap(toEnrichIdx, PDP_CONCURRENCY, async (idx) => {
        const url = ads[idx].url;
        const r = await callGecko(
          { target: "olx.com.br", type: "pdp", url },
          { apiKey: GECKO_API_KEY, label: `pdp-enrich[${idx}]`, retries: 1 },
        );
        if (r.ok && r.body?.notFound !== true) {
          pdpImages[idx] = extractPdpImages(r.body);
        } else {
          pdpImages[idx] = [];
        }
      });
    }

    const mapped = ads.map((ad, idx) => {
      const merged = Array.from(new Set([...(plpImagesByIdx[idx] ?? []), ...(pdpImages[idx] ?? [])])).slice(0, 10);
      return mapAd(user_id, search_id, ad, merged);
    }).filter((r) => !!r.source_url);

    let inserted: any[] = [];
    if (mapped.length > 0) {
      const { data: insRows, error: insErr } = await userClient
        .from("olx_search_results").insert(mapped).select();
      if (insErr) {
        await userClient.from("olx_searches").update({ status: "failed", error_message: insErr.message }).eq("id", search_id);
        return json({ error: insErr.message }, 500);
      }
      inserted = insRows ?? [];
    }

    const total_results = pick<number>(root, ["totalResults", "total", "count"]) ?? mapped.length;
    const next_page = pick<number>(root, ["nextPage", "next_page"]) ?? null;
    const next_page_url = pick<string>(root, ["nextPageUrl", "next_page_url"]) ?? null;

    await userClient.from("olx_searches").update({
      status: "completed", total_results, next_page, next_page_url,
      request_id: gecko?.requestId ?? null, execution_id: gecko?.executionId ?? null,
    }).eq("id", search_id);

    const enrichedWithImages = toEnrichIdx.filter((i) => (pdpImages[i]?.length ?? 0) > 0).length;
    const zeroImages = mapped.filter((m) => m.image_urls.length === 0).length;
    await userClient.from("processing_logs").insert({
      user_id, type: "search", status: zeroImages > 0 ? "warning" : "success",
      message: `Busca: ${mapped.length} resultado(s), PDP enrich ${enrichedWithImages}/${toEnrichIdx.length}, sem fotos: ${zeroImages}`,
      metadata_json: { search_id, total_results, enriched: enrichedWithImages, zero_images: zeroImages },
    });

    return json({ search_id, results: inserted, total: total_results, next_page, next_page_url });
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
