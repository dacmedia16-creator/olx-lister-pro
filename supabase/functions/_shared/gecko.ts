// Shared helpers for GeckoAPI OLX integration.
// deno-lint-ignore-file no-explicit-any

export const GECKO_ENDPOINT = "https://api.geckoapi.com.br/v1/extract";
const RETRY_STATUSES = new Set([429, 502, 503, 504]);

export function normalizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let u = raw.trim();
  if (!u) return null;
  if (u.startsWith("//")) u = "https:" + u;
  else if (u.startsWith("http://")) u = "https://" + u.slice(7);
  if (!/^https:\/\//i.test(u)) return null;
  u = u.replace(/\\u002F/g, "/").replace(/&amp;/g, "&");
  return u;
}

// Extract candidate URL from an image-like object (or plain string).
function pickUrl(item: any): string | null {
  if (item == null) return null;
  if (typeof item === "string") return normalizeUrl(item);
  if (typeof item !== "object") return null;
  // Prefer largest known variants
  const candidates = [
    item.original,
    item.originalUrl,
    item.large,
    item.big,
    item.xlarge,
    item.url,
    item.src,
    item.href,
    item.medium,
    item.thumb,
    item.thumbnail,
    item.small,
  ];
  for (const c of candidates) {
    const n = normalizeUrl(c);
    if (n) return n;
  }
  return null;
}

function collect(fields: any[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    if (!field) continue;
    if (Array.isArray(field)) {
      for (const it of field) {
        const u = pickUrl(it);
        if (u && !seen.has(u)) { seen.add(u); out.push(u); }
      }
    } else {
      const u = pickUrl(field);
      if (u && !seen.has(u)) { seen.add(u); out.push(u); }
    }
  }
  return out.slice(0, 10);
}

const IMAGE_EXT_RE = /https?:\/\/[^\s"'<>\\]+?\.(?:jpe?g|png|webp)(?:\?[^\s"'<>\\]*)?/gi;
const IMAGE_HOST_HINT_RE = /(img|image|photo|media|cdn|cloudfront|akamai|static)/i;

function looksLikeImageUrl(raw: string): boolean {
  if (/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(raw)) return true;
  try {
    const u = new URL(raw);
    const hostAndPath = `${u.hostname}${u.pathname}`;
    if (!IMAGE_HOST_HINT_RE.test(hostAndPath)) return false;
    // Avoid OLX page/category/listing URLs that appear in attribute links.
    if (/olx\.com\.br$/i.test(u.hostname) && !/thumb|image|img|photo|media|picture/i.test(u.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

function collectDeepImageUrls(root: any, maxDepth = 7): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const visited = new WeakSet<object>();

  function add(raw: unknown) {
    if (typeof raw !== "string") return;
    const direct = normalizeUrl(raw);
    if (direct && looksLikeImageUrl(direct) && !seen.has(direct)) {
      seen.add(direct);
      out.push(direct);
    }

    const decoded = raw.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
    const matches = decoded.match(IMAGE_EXT_RE) ?? [];
    for (const match of matches) {
      const n = normalizeUrl(match);
      if (n && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }

  function walk(value: any, depth: number) {
    if (out.length >= 20 || value == null || depth > maxDepth) return;
    if (typeof value === "string") {
      add(value);
      return;
    }
    if (typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      const keyLooksImage = /image|img|photo|picture|media|gallery|thumbnail|cover|url|src|href/i.test(key);
      if (typeof child === "string") {
        if (keyLooksImage || looksLikeImageUrl(child)) add(child);
      } else {
        walk(child, depth + 1);
      }
      if (out.length >= 20) return;
    }
  }

  walk(root, 0);
  return out.slice(0, 10);
}

function mergeUrls(...groups: string[][]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const u of group) {
      const n = normalizeUrl(u);
      if (n && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out.slice(0, 10);
}

export function extractPlpImages(item: any): string[] {
  if (!item || typeof item !== "object") return [];
  return collect([
    item.images,
    item.photos,
    item.media,
    item.thumbnails,
    item.thumbnail,
    item.image,
    item.mainImage,
    item.cover,
  ]);
}

export function extractPdpImages(gecko: any): string[] {
  return extractPdpImageDiagnostics(gecko).urls;
}

export function extractPdpImageDiagnostics(gecko: any): { urls: string[]; fieldImages: string[]; deepImages: string[] } {
  const roots = [
    gecko?.data?.data,
    gecko?.data,
    gecko,
  ].filter((r) => r && typeof r === "object");
  const fields: any[] = [];
  for (const r of roots) {
    fields.push(r.images, r.photos, r.media, r.gallery, r.thumbnails, r.thumbnail, r.image, r.mainImage, r.cover);
  }
  const fieldImages = collect(fields);
  const deepImages = mergeUrls(...roots.map((r) => collectDeepImageUrls(r)));
  return { urls: mergeUrls(fieldImages, deepImages), fieldImages, deepImages };
}

export type GeckoCallResult = {
  ok: boolean;
  status: number;
  body: any;
  requestId?: string | null;
  attempts: number;
  ms: number;
  error?: string;
};

export async function callGecko(
  payload: Record<string, any>,
  opts: { apiKey: string; retries?: number; timeoutMs?: number; label?: string } = {} as any,
): Promise<GeckoCallResult> {
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 30000;
  const label = opts.label ?? payload?.type ?? "gecko";
  const started = Date.now();
  let lastStatus = 0;
  let lastBody: any = null;
  let lastErr: string | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const resp = await fetch(GECKO_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
      clearTimeout(t);
      lastStatus = resp.status;
      const text = await resp.text();
      try { lastBody = text ? JSON.parse(text) : null; } catch { lastBody = { raw: text }; }
      const requestId = lastBody?.requestId ?? null;
      console.log(`[gecko:${label}] attempt=${attempt + 1} status=${resp.status} requestId=${requestId} ms=${Date.now() - started}`);
      if (resp.ok) {
        return { ok: true, status: resp.status, body: lastBody, requestId, attempts: attempt + 1, ms: Date.now() - started };
      }
      if (!RETRY_STATUSES.has(resp.status)) {
        return { ok: false, status: resp.status, body: lastBody, requestId, attempts: attempt + 1, ms: Date.now() - started };
      }
    } catch (e: any) {
      clearTimeout(t);
      lastErr = String(e?.message ?? e);
      console.log(`[gecko:${label}] attempt=${attempt + 1} error=${lastErr}`);
    }
    if (attempt < retries) {
      const backoff = 1500 * Math.pow(2, attempt); // 1.5s, 3s
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  return { ok: false, status: lastStatus, body: lastBody, attempts: retries + 1, ms: Date.now() - started, error: lastErr };
}

export function mapGeckoStatusMessage(status: number): string {
  if (status === 400) return "Payload inválido";
  if (status === 401) return "Chave da GeckoAPI inválida ou ausente";
  if (status === 402) return "Créditos insuficientes na GeckoAPI";
  if (status === 403) return "Acesso negado à API";
  if (status === 409) return "Conflito de execução";
  if (status === 429) return "Limite de requisições excedido";
  if (status >= 500) return "Erro temporário na GeckoAPI";
  return `Erro HTTP ${status}`;
}

// Concurrency-limited map
export async function pmap<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}
