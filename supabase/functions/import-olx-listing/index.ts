// Edge Function: import-olx-listing
// Chama a GeckoAPI PDP para uma URL da OLX e persiste anúncio + URLs de fotos (sem baixar pro storage).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callGecko, extractImageUrlsFromText, extractPdpImageDiagnostics, extractPlpImages, isLikelyImageUrl, mapGeckoStatusMessage } from "../_shared/gecko.ts";
import { detectPortal, geckoPayloadFor, geckoSourceLabel, type Portal } from "../_shared/portals.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const GECKO_API_KEY = Deno.env.get("GECKO_API_KEY");

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
  return String(ad?.url ?? ad?.link ?? ad?.href ?? ad?.shareUrl ?? ad?.canonicalUrl ?? "");
}

function collectIdCandidates(...values: unknown[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    if (value == null) continue;
    const raw = String(value).trim();
    if (!raw) continue;
    out.add(raw.toLowerCase());
    for (const match of raw.matchAll(/\d{6,}/g)) out.add(match[0]);
  }
  return Array.from(out);
}

function getAdIds(ad: any): string[] {
  const direct = collectIdCandidates(
    ad?.listingId,
    ad?.listing_id,
    ad?.listId,
    ad?.list_id,
    ad?.adId,
    ad?.ad_id,
    ad?.id,
    ad?.code,
    ad?.legacyId,
    ad?.legacy_id,
    ad?.externalId,
    ad?.external_id,
    ad?.sourceId,
    ad?.source_id,
  );
  // Fallback: varredura rasa dos campos string para pegar ID numérico que a GeckoAPI às vezes
  // esconde em link/sourceUrl/href/canonicalUrl do card.
  const extra: string[] = [];
  if (ad && typeof ad === "object") {
    const strFields = [ad?.url, ad?.link, ad?.href, ad?.shareUrl, ad?.canonicalUrl, ad?.sourceUrl, ad?.detailUrl];
    for (const v of strFields) {
      if (typeof v === "string") extra.push(...collectIdCandidates(v));
    }
  }
  return Array.from(new Set([...direct, ...extra]));
}

function getUrlIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const u = new URL(raw);
    return collectIdCandidates(u.pathname);
  } catch {
    return collectIdCandidates(String(raw).split("?")[0]);
  }
}

function normalizeSlug(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const last = u.pathname.split("/").filter(Boolean).at(-1) ?? "";
    return decodeURIComponent(last).toLowerCase().replace(/-\d{6,}$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  } catch {
    const last = String(raw).split("?")[0].split("/").filter(Boolean).at(-1) ?? "";
    return last.toLowerCase().replace(/-\d{6,}$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
}

function getMatchInfo(sourceUrl: string, listingRoot?: any) {
  return {
    normalizedUrl: normalizeUrlForMatch(sourceUrl),
    ids: new Set([
      ...collectIdCandidates(
        listingRoot?.listingId,
        listingRoot?.listing_id,
        listingRoot?.adId,
        listingRoot?.ad_id,
        listingRoot?.id,
        listingRoot?.listingExternalId,
        listingRoot?.externalId,
      ),
      ...getUrlIds(sourceUrl),
    ]),
    slug: normalizeSlug(sourceUrl),
  };
}

function scoreAdMatch(ad: any, source: ReturnType<typeof getMatchInfo>) {
  const adUrl = getAdUrl(ad);
  const normalizedAdUrl = normalizeUrlForMatch(adUrl);
  const adIds = new Set([...getAdIds(ad), ...getUrlIds(adUrl)]);
  const sharedIds = Array.from(adIds).filter((id) => source.ids.has(id));
  const adSlug = normalizeSlug(adUrl);

  let score = 0;
  const reasons: string[] = [];
  if (sharedIds.length > 0) { score += 100; reasons.push(`id:${sharedIds.slice(0, 3).join(",")}`); }
  if (normalizedAdUrl && source.normalizedUrl && normalizedAdUrl === source.normalizedUrl) { score += 80; reasons.push("url_exact"); }
  if (normalizedAdUrl && source.normalizedUrl && (normalizedAdUrl.includes(source.normalizedUrl) || source.normalizedUrl.includes(normalizedAdUrl))) { score += 45; reasons.push("url_contains"); }
  if (adSlug && source.slug && adSlug === source.slug) { score += 45; reasons.push("slug_exact"); }
  if (adSlug && source.slug && adSlug.length > 18 && source.slug.length > 18 && (adSlug.includes(source.slug) || source.slug.includes(adSlug))) { score += 25; reasons.push("slug_contains"); }

  return { score, reasons, adUrl, normalizedAdUrl, adIds: Array.from(adIds), adSlug };
}

function normalizeUrlForMatch(raw: string | null | undefined): string {
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

function slugifySearchPath(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function deriveZapPlpFallbackUrls(sourceUrl: string, listingRoot?: any, title?: string | null): string[] {
  const urls: string[] = [];
  const add = (raw: string | null | undefined) => {
    if (!raw) return;
    try {
      const normalized = new URL(raw).toString();
      if (!urls.includes(normalized)) urls.push(normalized);
    } catch {
      // ignore invalid fallback candidates
    }
  };

  try {
    const u = new URL(sourceUrl);
    const origin = u.origin;
    const path = u.pathname.split("/").filter(Boolean);
    const city = slugifySearchPath(listingRoot?.address?.city);
    const state = slugifySearchPath(listingRoot?.address?.stateAcronym ?? listingRoot?.address?.state);
    const neighborhood = slugifySearchPath(listingRoot?.address?.neighborhood);
    const isRent = /rent|alug/i.test(String(listingRoot?.businessType ?? listingRoot?.contractType ?? sourceUrl));
    const business = isRent ? "aluguel" : "venda";
    const rawType = String(listingRoot?.listingType ?? listingRoot?.unitType ?? listingRoot?.category ?? "imovel");
    const type = /apart/i.test(rawType) ? "apartamentos" : /casa/i.test(rawType) ? "casas" : "imoveis";

    if (path[0] === "imovel") {
      const listingSlug = path[1] ?? "";
      const stripped = listingSlug.replace(/-id-?\d+.*$/i, "");
      if (stripped) add(`${origin}/busca/imoveis/${stripped}/`);
    }
    if (city && state) {
      add(`${origin}/${business}/${type}/${state}+${city}/`);
      if (neighborhood) add(`${origin}/${business}/${type}/${state}+${city}+${neighborhood}/`);
      add(`${origin}/busca/imoveis/${state}+${city}/`);
      if (neighborhood) add(`${origin}/busca/imoveis/${state}+${city}+${neighborhood}/`);
    }
    if (title) {
      const q = encodeURIComponent(title.replace(/\s+/g, " ").trim());
      add(`${origin}/busca/imoveis/?q=${q}`);
    }
  } catch {
    // ignore malformed source URL; validation already happened upstream
  }

  return urls.slice(0, 6);
}

function getZapBusinessType(listingRoot?: any, sourceUrl?: string): "rent" | "sale" {
  const raw = String(listingRoot?.businessType ?? listingRoot?.contractType ?? sourceUrl ?? "").toLowerCase();
  if (/rent|rental|alug/.test(raw)) return "rent";
  return "sale";
}

function getZapKeyword(listingRoot?: any, title?: string | null): string | null {
  const listingType = String(listingRoot?.listingType ?? "").toLowerCase();
  const titleText = String(title ?? listingRoot?.title ?? "").toLowerCase();
  if (/apart/.test(listingType) || /apart/.test(titleText)) return "apartamento";
  if (/casa/.test(listingType) || /casa/.test(titleText)) return "casa";
  return null;
}

function parseZapAddressFallback(listingRoot?: any): { city: string | null; state: string | null; neighborhood: string | null } {
  const formatted = String(listingRoot?.formattedAddress ?? "");
  // Ex.: "Avenida X, 1893 - Jardim Sao Carlos, Sorocaba - SP"
  const parts = formatted.split(",").map((p) => p.trim()).filter(Boolean);
  const cityStateMatch = formatted.match(/([^,\-]+?)\s*-\s*([A-Z]{2})(?:\b|,|$)/i);
  const city = cityStateMatch?.[1]?.trim() || null;
  const state = cityStateMatch?.[2]?.toUpperCase() || null;

  // Bairro: penúltimo segmento (antes de "Cidade - UF"), removendo prefixo "... - "
  let neighborhood: string | null = null;
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 2];
    neighborhood = candidate.includes(" - ") ? (candidate.split(" - ").pop()?.trim() ?? null) : candidate;
  } else if (parts.length === 1 && parts[0].includes(" - ")) {
    neighborhood = parts[0].split(" - ").pop()?.trim() ?? null;
  }
  if (neighborhood && city && neighborhood.toLowerCase() === city.toLowerCase()) neighborhood = null;

  return { city, state, neighborhood: neighborhood || null };
}

function numberFromText(raw: unknown, re: RegExp): number | null {
  const match = String(raw ?? "").match(re);
  if (!match?.[1]) return null;
  const n = Number(match[1].replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getZapBedroomCount(listingRoot?: any, title?: string | null): number | null {
  const attrs = [listingRoot?.bedrooms, listingRoot?.bedroom, listingRoot?.suites, ...(Array.isArray(listingRoot?.amenities) ? listingRoot.amenities : [])];
  for (const a of attrs) {
    const n = typeof a === "number" ? a : numberFromText(a, /(\d+)\s*(?:quartos?|dormit[oó]rios?)/i);
    if (n) return n;
  }
  return numberFromText(`${title ?? ""} ${listingRoot?.title ?? ""} ${listingRoot?.description ?? ""}`, /(\d+)\s*(?:quartos?|dormit[oó]rios?)/i);
}

function getZapArea(listingRoot?: any, title?: string | null): number | null {
  const candidates = [listingRoot?.area, listingRoot?.usableArea, listingRoot?.totalArea, listingRoot?.unitArea, title, listingRoot?.title, listingRoot?.description];
  for (const c of candidates) {
    if (typeof c === "number" && c > 0) return c;
    const n = numberFromText(c, /(\d+)\s*m[²2]/i);
    if (n) return n;
  }
  return null;
}

function getZapNumericArray(listingRoot: any, keys: string[], labelRe: RegExp): number[] | null {
  for (const key of keys) {
    const value = key.split(".").reduce((acc: any, part) => acc?.[part], listingRoot);
    const n = typeof value === "number" ? value : numberFromText(value, labelRe);
    if (n) return [n];
  }
  const text = `${listingRoot?.title ?? ""} ${listingRoot?.description ?? ""}`;
  const n = numberFromText(text, labelRe);
  return n ? [n] : null;
}

function getZapPrice(listingRoot?: any): number | null {
  const candidates = [listingRoot?.prices?.price, listingRoot?.prices?.mainValue, listingRoot?.price, listingRoot?.mainValue];
  for (const c of candidates) {
    if (typeof c === "number" && c > 0) return c;
    if (typeof c === "string") {
      const n = Number(c.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function getZapLatLng(listingRoot?: any): { latitude: number; longitude: number } | null {
  const lat = Number(listingRoot?.address?.latitude ?? listingRoot?.address?.lat ?? listingRoot?.latitude ?? listingRoot?.lat);
  const lng = Number(listingRoot?.address?.longitude ?? listingRoot?.address?.lng ?? listingRoot?.longitude ?? listingRoot?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) return { latitude: lat, longitude: lng };
  return null;
}

function pushUniquePayload(out: Record<string, any>[], payload: Record<string, any>) {
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)));
  const key = JSON.stringify(clean, Object.keys(clean).sort());
  if (!out.some((p) => JSON.stringify(p, Object.keys(p).sort()) === key)) out.push(clean);
}

function buildPlpPayloads(portal: Portal, plpUrl: string, sourceUrl: string, listingRoot?: any, title?: string | null): Record<string, any>[] {
  if (portal !== "zap") return [{ target: geckoSourceLabel(portal), type: "plp", url: plpUrl }];

  const addressFallback = parseZapAddressFallback(listingRoot);
  const city = listingRoot?.address?.city ?? addressFallback.city;
  const state = listingRoot?.address?.stateAcronym ?? listingRoot?.address?.state ?? addressFallback.state;
  const neighborhood = listingRoot?.address?.neighborhood ?? addressFallback.neighborhood;
  if (!city || !state) return [];

  const base: Record<string, any> = {
    target: "zapimoveis.com.br",
    type: "plp",
    city: String(city),
    state: String(state).slice(0, 2).toUpperCase(),
    businessType: getZapBusinessType(listingRoot, sourceUrl),
    sort: "updated_desc",
  };
  const keyword = getZapKeyword(listingRoot, title);
  const area = getZapArea(listingRoot, title);
  const bedrooms = getZapBedroomCount(listingRoot, title);
  const latLng = getZapLatLng(listingRoot);
  const price = getZapPrice(listingRoot);
  const sourceIds = getMatchInfo(sourceUrl, listingRoot).ids;
  const numericId = Array.from(sourceIds).find((id) => /^\d{8,}$/.test(id));

  const priceBand = price ? { priceMin: Math.floor(price * 0.85), priceMax: Math.ceil(price * 1.15) } : {};

  const payloads: Record<string, any>[] = [];

  // 1) Tentativas mais precisas primeiro: id numérico como keyword.
  if (numericId) {
    pushUniquePayload(payloads, { ...base, keyword: numericId, page: 1 });
    if (neighborhood) pushUniquePayload(payloads, { ...base, neighborhood: String(neighborhood), keyword: numericId, page: 1 });
  }

  // 2) Bairro + quartos + faixa de preço reduz drasticamente o universo.
  if (neighborhood) {
    for (let page = 1; page <= 3; page++) {
      pushUniquePayload(payloads, { ...base, neighborhood: String(neighborhood), ...(bedrooms ? { bedrooms: [bedrooms] } : {}), ...priceBand, page });
    }
  }

  // 3) Lat/Long (quando disponível).
  if (latLng) {
    for (let page = 1; page <= 3; page++) pushUniquePayload(payloads, { ...base, ...latLng, ...(bedrooms ? { bedrooms: [bedrooms] } : {}), page });
  }

  // 4) Cidade inteira com filtros — pageLimit ampliado para achar anúncios recém-listados.
  const filters: Record<string, any> = { ...(bedrooms ? { bedrooms: [bedrooms] } : {}) };
  const pageLimit = bedrooms ? 12 : 6;
  for (let page = 1; page <= pageLimit; page++) {
    if (Object.keys(filters).length > 0) pushUniquePayload(payloads, { ...base, ...filters, ...priceBand, page });
    else pushUniquePayload(payloads, { ...base, ...priceBand, page });
  }

  if (area && !bedrooms) {
    for (let page = 1; page <= 4; page++) pushUniquePayload(payloads, { ...base, areaMin: Math.max(0, area - 20), areaMax: area + 20, page });
  }

  // 5) Keyword textual composta (bairro + quartos + área) como último recurso.
  const composed: string[] = [];
  if (bedrooms) composed.push(`${bedrooms} quartos`);
  if (neighborhood) composed.push(String(neighborhood));
  if (area) composed.push(`${area}m2`);
  if (composed.length >= 2) {
    for (let page = 1; page <= 2; page++) pushUniquePayload(payloads, { ...base, keyword: composed.join(" "), page });
  }
  if (keyword) {
    for (let page = 1; page <= 2; page++) pushUniquePayload(payloads, { ...base, keyword, page });
  }

  return payloads.slice(0, 18);
}

function derivePlpFallbackUrls(sourceUrl: string, listingRoot?: any, title?: string | null, portal: Portal = "olx"): string[] {
  // A PLP do ZAP na GeckoAPI não aceita URL direta; usa city/state/businessType.
  // Retornamos apenas um marcador para não repetir o mesmo conjunto de payloads.
  if (portal === "zap") return [sourceUrl];

  const urls: string[] = [];
  const add = (raw: string | null | undefined) => {
    if (!raw) return;
    try {
      const normalized = new URL(raw).toString();
      if (!urls.includes(normalized)) urls.push(normalized);
    } catch {
      // ignore invalid fallback candidates
    }
  };

  const attrs = Array.isArray(listingRoot?.attributes) ? listingRoot.attributes : [];
  const attrUrl = attrs
    .map((a: any) => typeof a?.url === "string" ? a.url : null)
    .find((u: string | null) => u && /olx\.com\.br\/imoveis/i.test(u) && !/\d{8,}/.test(u));
  add(attrUrl);

  try {
    const u = new URL(sourceUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1] ?? "";
      const looksLikeListingSlug = /\d{8,}/.test(last) || last.includes("-");
      const plpParts = looksLikeListingSlug ? parts.slice(0, -1) : parts;
      if (plpParts.length > 0) add(`${u.origin}/${plpParts.join("/")}`);
    }
  } catch {
    // ignore malformed source URL; validation already happened upstream
  }

  if (title) {
    for (const base of [...urls]) {
      try {
        const u = new URL(base);
        u.searchParams.set("q", title.replace(/\s+/g, " ").trim());
        add(u.toString());
      } catch {
        // ignore invalid candidate
      }
    }
  }

  return urls.slice(0, 4);
}

async function fetchPlpFallbackImages(url: string, apiKey: string, portal: Portal, listingRoot?: any, title?: string | null) {
  const plpUrls = derivePlpFallbackUrls(url, listingRoot, title, portal);
  if (plpUrls.length === 0) {
    return { urls: [] as string[], plpUrl: null as string | null, itemCount: 0, matched: false, requestId: null as string | null, attempts: [] as any[] };
  }

  const source = getMatchInfo(url, listingRoot);
  const attempts: any[] = [];
  let lastRequestId: string | null = null;
  let lastItemCount = 0;

  for (const plpUrl of plpUrls) {
    const payloads = buildPlpPayloads(portal, plpUrl, url, listingRoot, title);
    if (payloads.length === 0) {
      attempts.push({ url: plpUrl, ok: false, status: 0, error: "Dados insuficientes para PLP", request_id: null });
      continue;
    }

    for (const payload of payloads) {
      const r = await callGecko(
        payload,
        { apiKey, label: `plp-image-fallback-${portal}`, retries: 0, timeoutMs: 18000 },
      );
    lastRequestId = r.requestId ?? null;
    if (!r.ok || r.body?.notFound === true) {
      attempts.push({ url: plpUrl, ok: false, status: r.status, request_id: lastRequestId, payload });
      continue;
    }

    const ads = extractAds(r.body);
    lastItemCount = ads.length;
    const scored = ads
      .map((ad) => ({ ad, match: scoreAdMatch(ad, source) }))
      .sort((a, b) => b.match.score - a.match.score);
    const best = scored[0]?.match ?? null;
    const matched = scored.find((x) => x.match.score >= 45 && x.match.reasons.some((r) => r.startsWith("id:") || r === "url_exact" || r === "url_contains" || r === "slug_exact"));

    attempts.push({
      url: plpUrl,
      payload,
      ok: true,
      item_count: ads.length,
      request_id: lastRequestId,
      source_ids: Array.from(source.ids).slice(0, 6),
      source_slug: source.slug,
      best_score: best?.score ?? 0,
      best_reasons: best?.reasons ?? [],
      best_url: best?.adUrl ?? null,
      matched: Boolean(matched),
    });

    if (matched) {
      const urls = extractPlpImages(matched.ad);
      if (urls.length > 0) {
        return {
          urls,
          plpUrl,
          itemCount: ads.length,
          matched: true,
          requestId: lastRequestId,
          attempts,
        };
      }
    }
    }
  }

  return {
    urls: [] as string[],
    plpUrl: plpUrls[plpUrls.length - 1] ?? null,
    itemCount: lastItemCount,
    matched: false,
    requestId: lastRequestId,
    attempts,
  };
}

async function fetchZapPublicPageImages(url: string) {
  const started = Date.now();
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const text = await resp.text();
    return {
      ok: resp.ok,
      status: resp.status,
      urls: extractImageUrlsFromText(text),
      ms: Date.now() - started,
    };
  } catch (e: any) {
    return { ok: false, status: 0, urls: [] as string[], ms: Date.now() - started, error: String(e?.message ?? e) };
  }
}

async function mapListing(user_id: string, source_url: string, gecko: any, portal: Portal) {
  const d = getListingRoot(gecko);

  if (portal === "zap") {
    const address = pick<any>(d, ["address"]) ?? {};
    const advertiser = pick<any>(d, ["advertiser"]) ?? {};
    const prices = pick<any>(d, ["prices"]) ?? {};

    const rawPhones: string[] = [];
    const phoneList = advertiser?.phoneNumbers;
    if (Array.isArray(phoneList)) rawPhones.push(...phoneList.filter((p: any) => typeof p === "string"));
    if (typeof advertiser?.mainPhone === "string") rawPhones.push(advertiser.mainPhone);
    if (typeof advertiser?.whatsAppNumber === "string") rawPhones.push(advertiser.whatsAppNumber);
    const uniqPhones = Array.from(new Set(rawPhones.filter(Boolean)));
    const phoneHashes = await Promise.all(uniqPhones.map((p) => sha256(p)));

    let sellerHash: string | null = null;
    if (advertiser?.name) sellerHash = await sha256(String(advertiser.name));

    const priceValue = typeof prices?.price === "number" ? prices.price : null;

    const attributes = {
      amenities: Array.isArray(d?.amenities) ? d.amenities : null,
      mainAmenities: Array.isArray(d?.mainAmenities) ? d.mainAmenities : null,
      infoTags: Array.isArray(d?.infoTags) ? d.infoTags : null,
      monthlyCondoFee: prices?.monthlyCondoFee ?? null,
      iptu: prices?.iptu ?? null,
      rentalPeriod: prices?.rentalPeriod ?? null,
      rentalWarranties: prices?.rentalWarranties ?? null,
      virtualTourUrl: d?.virtualTourUrl ?? null,
      condominiumName: d?.condominiumName ?? null,
      formattedAddress: d?.formattedAddress ?? null,
      publicationType: d?.publicationType ?? null,
      creci: advertiser?.creci ?? null,
    };

    return {
      user_id,
      source: geckoSourceLabel(portal),
      source_portal: portal,
      source_url,
      listing_id: d?.listingId ? String(d.listingId) : null,
      ad_id: d?.listingExternalId ? String(d.listingExternalId) : null,
      title: d?.title ?? d?.metaTitle ?? null,
      description: d?.description ?? null,
      price: priceValue,
      currency: "BRL",
      listed_at: d?.createdAt ?? d?.updatedAt ?? null,
      category: d?.listingType ?? null,
      main_category: d?.businessType ?? null,
      sub_category: d?.listingType ?? null,
      state: address?.stateAcronym ?? address?.state ?? null,
      city: address?.city ?? null,
      neighborhood: address?.neighborhood ?? null,
      region: null,
      ddd: null,
      zip_code: address?.zipCode ?? null,
      seller_id: advertiser?.id ? String(advertiser.id) : null,
      seller_name_hash: sellerHash,
      seller_is_professional: true,
      phone_hashes: phoneHashes.length ? phoneHashes : null,
      attributes_json: attributes,
      olx_pay_enabled: null,
      olx_delivery_enabled: null,
      request_id: gecko?.requestId ?? null,
      execution_id: gecko?.executionId ?? null,
      extracted_at: gecko?.data?.extractedAt ?? gecko?.extractedAt ?? null,
    };
  }

  // OLX mapping (original)
  const seller = pick<any>(d, ["seller", "user", "advertiser", "account", "publisher"]) ?? {};
  const location = pick<any>(d, ["location", "address"]) ?? {};

  let phoneHashes: string[] = [];
  const preHashed = pick<any[]>(d, ["phoneHashes", "phone_hashes"]);
  if (Array.isArray(preHashed)) {
    phoneHashes = preHashed.filter((x) => typeof x === "string");
  } else {
    const rawPhones = pick<any[]>(d, ["seller.phones", "phones", "contact.phones", "account.phones"]) ?? [];
    phoneHashes = await Promise.all(
      rawPhones.map((p: any) => (typeof p === "string" ? p : p?.number || p?.phone)).filter(Boolean).map((p: string) => sha256(p)),
    );
  }

  let sellerHash: string | null = seller?.nameHash ?? seller?.name_hash ?? null;
  if (!sellerHash && (seller?.name || seller?.displayName)) {
    sellerHash = await sha256(String(seller.name ?? seller.displayName));
  }

  const rawPrice = pick<any>(d, ["price.value", "price", "priceValue", "pricingInfos.price", "pricingInfos.0.price"]);
  const price = typeof rawPrice === "number"
    ? rawPrice
    : (typeof rawPrice === "string" ? Number(rawPrice.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || null : null);

  return {
    user_id,
    source: geckoSourceLabel(portal),
    source_portal: portal,
    source_url,
    listing_id: pick<string>(d, ["listingId", "listing_id", "id"]) ?? null,
    ad_id: pick<string>(d, ["adId", "ad_id"]) ?? null,
    title: pick<string>(d, ["title", "name"]) ?? null,
    description: pick<string>(d, ["description", "body"]) ?? null,
    price,
    currency: pick<string>(d, ["price.currency", "currency"]) ?? "BRL",
    listed_at: pick<string>(d, ["listedAt", "listed_at", "publishedAt", "createdAt", "createdDate"]) ?? null,
    category: pick<string>(d, ["category", "categoryName", "unitType"]) ?? null,
    main_category: pick<string>(d, ["mainCategory", "main_category", "portal"]) ?? null,
    sub_category: pick<string>(d, ["subCategory", "sub_category", "usageType"]) ?? null,
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
    attributes_json: pick<any>(d, ["attributes", "properties", "specs", "amenities"]) ?? null,
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
    const invalid = urls.filter((u) => detectPortal(u) === null);
    if (invalid.length > 0) return json({ error: "URLs inválidas. Apenas olx.com.br e zapimoveis.com.br são suportados.", invalid }, 400);

    const { data: jobIns, error: jobErr } = await userClient
      .from("olx_import_jobs")
      .insert({ user_id, status: "processing", total_urls: urls.length })
      .select().single();
    if (jobErr) return json({ error: jobErr.message }, 500);
    const jobId = jobIns.id;

    let successful = 0, failed = 0, notFoundCount = 0;
    const importedListingIds: Record<string, string> = {};

    for (const url of urls) {
      const portal = detectPortal(url)!;
      try {
        const pdp = await callGecko(
          geckoPayloadFor(portal, url),
          { apiKey: GECKO_API_KEY, label: `pdp-import-${portal}` },
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

        const mapped = await mapListing(user_id, url, gecko, portal);

        // Extração de fotos: campos oficiais + varredura profunda; tenta 1x mais se vier pouco.
        let imageDiagnostics = extractPdpImageDiagnostics(gecko);
        let imageUrls = imageDiagnostics.urls;
        let imageSource = imageUrls.length > 0 ? "pdp" : "none";
        let plpFallback: Awaited<ReturnType<typeof fetchPlpFallbackImages>> | null = null;
        let publicPageFallback: Awaited<ReturnType<typeof fetchZapPublicPageImages>> | null = null;
        if (imageUrls.length < 3) {
          const retry = await callGecko(
            geckoPayloadFor(portal, url),
            { apiKey: GECKO_API_KEY, label: `pdp-import-retry-${portal}`, retries: 1 },
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

        // Fallback PLP para OLX e ZAP, com match seguro por ID/URL/slug para evitar fotos de relacionados.
        if (imageUrls.length === 0) {
          plpFallback = await fetchPlpFallbackImages(url, GECKO_API_KEY, portal, getListingRoot(gecko), mapped.title);
          if (plpFallback.urls.length > 0) {
            imageUrls = plpFallback.urls;
            imageSource = "plp_fallback";
          }
        }

        if (imageUrls.length === 0 && portal === "zap") {
          publicPageFallback = await fetchZapPublicPageImages(url);
          if (publicPageFallback.urls.length > 0) {
            imageUrls = publicPageFallback.urls;
            imageSource = "public_page_fallback";
          }
        }
        imageUrls = imageUrls.filter(isLikelyImageUrl);
        if (imageUrls.length === 0) imageSource = "none";

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
              public_page_fallback: publicPageFallback?.urls.length ?? 0,
            },
            plp_fallback: plpFallback ? {
              url: plpFallback.plpUrl,
              item_count: plpFallback.itemCount,
              matched_listing: plpFallback.matched,
              request_id: plpFallback.requestId,
              attempts: plpFallback.attempts,
            } : null,
            public_page_fallback: publicPageFallback ? {
              status: publicPageFallback.status,
              ok: publicPageFallback.ok,
              ms: publicPageFallback.ms,
              count: publicPageFallback.urls.length,
              sample: publicPageFallback.urls.slice(0, 3),
              error: "error" in publicPageFallback ? publicPageFallback.error : null,
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
          .upsert({ ...mapped, images_source: imageSource }, { onConflict: "user_id,source_url" })
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
            original_external_url: u, status: "downloaded", position: i,
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
