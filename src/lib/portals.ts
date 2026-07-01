export type Portal = "olx" | "zap";

const OLX_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*olx\.com\.br\//i;
const ZAP_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*zapimoveis\.com\.br\//i;

export function detectPortal(raw: string): Portal | null {
  try {
    const u = new URL(raw.trim()).toString();
    if (OLX_RE.test(u)) return "olx";
    if (ZAP_RE.test(u)) return "zap";
    return null;
  } catch {
    return null;
  }
}

export function isValidListingUrl(u: string): boolean {
  return detectPortal(u) !== null;
}

export const PORTAL_LABEL: Record<Portal, string> = {
  olx: "OLX",
  zap: "ZAP Imóveis",
};
