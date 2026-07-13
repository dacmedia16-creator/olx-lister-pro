export type Portal = "olx" | "zap" | "viva";

const OLX_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*olx\.com\.br\//i;
const ZAP_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*zapimoveis\.com\.br\//i;
const VIVA_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*vivareal\.com\.br\//i;

export function detectPortal(raw: string): Portal | null {
  try {
    const u = new URL(raw.trim()).toString();
    if (OLX_RE.test(u)) return "olx";
    if (ZAP_RE.test(u)) return "zap";
    if (VIVA_RE.test(u)) return "viva";
    return null;
  } catch {
    return null;
  }
}

export function geckoPayloadFor(portal: Portal, url: string) {
  if (portal === "zap") return { target: "zapimoveis.com.br", type: "pdp", url };
  if (portal === "viva") return { target: "vivareal.com.br", type: "pdp", url };
  return { target: "olx.com.br", type: "pdp", url };
}

export function geckoSourceLabel(portal: Portal): string {
  if (portal === "zap") return "zapimoveis.com.br";
  if (portal === "viva") return "vivareal.com.br";
  return "olx.com.br";
}
