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

export function geckoPayloadFor(portal: Portal, url: string) {
  if (portal === "zap") return { target: "zapimoveis.com.br", type: "pdp", url };
  return { target: "olx.com.br", type: "pdp", url };
}

export function geckoSourceLabel(portal: Portal): string {
  return portal === "zap" ? "zapimoveis.com.br" : "olx.com.br";
}
