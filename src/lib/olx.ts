import { isValidListingUrl as isValidPortalUrl } from "./portals";

export const OLX_URL_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*olx\.com\.br\//i;

// Compat: agora aceita OLX ou ZAP Imóveis
export function isValidOlxUrl(u: string): boolean {
  return isValidPortalUrl(u);
}

export function formatBRL(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

export const JOB_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  processing: "Processando",
  completed: "Concluído",
  failed: "Erro",
};
