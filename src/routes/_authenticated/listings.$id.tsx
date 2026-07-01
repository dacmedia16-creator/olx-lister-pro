import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, ImageOff, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatBRL, formatDate } from "@/lib/olx";
import { HashBadge } from "@/components/HashBadge";
import { OlxImageCarousel } from "@/components/OlxImageCarousel";

export const Route = createFileRoute("/_authenticated/listings/$id")({
  head: () => ({ meta: [{ title: "Detalhes do anúncio" }] }),
  component: ListingDetail,
});

type Listing = {
  id: string;
  title: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  category: string | null;
  main_category: string | null;
  sub_category: string | null;
  state: string | null;
  city: string | null;
  neighborhood: string | null;
  ddd: string | null;
  zip_code: string | null;
  seller_id: string | null;
  seller_name_hash: string | null;
  seller_is_professional: boolean | null;
  phone_hashes: string[] | null;
  attributes_json: Record<string, unknown> | null;
  source_url: string;
  listed_at: string | null;
  request_id: string | null;
  execution_id: string | null;
  extracted_at: string | null;
  olx_pay_enabled: boolean | null;
  olx_delivery_enabled: boolean | null;
};

type Image = { id: string; original_external_url: string | null; original_storage_path: string | null; status: string; position: number | null };

function ListingDetail() {
  const { id } = Route.useParams();
  const [listing, setListing] = useState<Listing | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [reimporting, setReimporting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("olx_listings").select("*").eq("id", id).maybeSingle();
    setListing(data as Listing | null);
    const { data: imgs } = await supabase
      .from("listing_images")
      .select("id,original_external_url,original_storage_path,status,position")
      .eq("listing_id", id)
      .order("position", { ascending: true });
    setImages((imgs as Image[]) ?? []);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const reimport = useCallback(async () => {
    if (!listing) return;
    setReimporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-olx-listing", {
        body: { urls: [listing.source_url] },
      });
      if (error) throw error;
      const jobId = (data as { job_id?: string })?.job_id;
      if (!jobId) throw new Error("Job não retornado");

      // Polling simples
      const start = Date.now();
      while (Date.now() - start < 60_000) {
        await new Promise((r) => setTimeout(r, 1500));
        const { data: job } = await supabase
          .from("olx_import_jobs")
          .select("status")
          .eq("id", jobId)
          .maybeSingle();
        const s = (job as { status?: string } | null)?.status;
        if (s && s !== "queued" && s !== "processing") break;
      }
      await load();
      toast.success("Reimportação concluída");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao reimportar");
    } finally {
      setReimporting(false);
    }
  }, [listing, load]);

  if (!listing) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  const attrs = listing.attributes_json && typeof listing.attributes_json === "object"
    ? Object.entries(listing.attributes_json as Record<string, unknown>)
    : [];

  const hasImages = images.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/listings" className="text-sm text-muted-foreground hover:underline">← Voltar</Link>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{listing.title ?? "(sem título)"}</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {[listing.neighborhood, listing.city, listing.state].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-3xl font-semibold">{formatBRL(listing.price)}</div>
          <div className="text-xs text-muted-foreground">Publicado: {formatDate(listing.listed_at)}</div>
          <a
            href={listing.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Abrir na OLX
          </a>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Fotos</CardTitle></CardHeader>
        <CardContent>
          {!hasImages ? (
            <div className="flex flex-col items-start gap-3 rounded-md border border-dashed p-6">
              <div className="flex items-center gap-2">
                <ImageOff className="h-5 w-5 text-muted-foreground" />
                <p className="font-medium">Fotos indisponíveis</p>
              </div>
              <p className="text-sm text-muted-foreground">
                A GeckoAPI não conseguiu extrair as fotos deste anúncio (comum em imóveis). A página da OLX
                pode expor as fotos em outro momento — tente reimportar mais tarde, ou veja as fotos direto no site.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={reimport} disabled={reimporting}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${reimporting ? "animate-spin" : ""}`} />
                  {reimporting ? "Reimportando..." : "Reimportar anúncio"}
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={listing.source_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> Ver fotos na OLX
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {images.map((im) => (
                <div key={im.id} className="aspect-video overflow-hidden rounded-md bg-muted">
                  {im.url ? (
                    <img src={im.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      {im.status === "failed" ? "falhou" : "processando"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Descrição</CardTitle></CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{listing.description ?? "—"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Informações</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Info label="Categoria" value={[listing.main_category, listing.sub_category, listing.category].filter(Boolean).join(" › ") || "—"} />
          <Info label="CEP" value={listing.zip_code ?? "—"} />
          <Info label="DDD" value={listing.ddd ?? "—"} />
          <Info label="OLX Pay" value={listing.olx_pay_enabled ? "sim" : "não"} />
          <Info label="OLX Delivery" value={listing.olx_delivery_enabled ? "sim" : "não"} />
          <Info label="URL original" value={<a className="text-primary hover:underline" href={listing.source_url} target="_blank" rel="noreferrer">{listing.source_url}</a>} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vendedor</CardTitle>
          <p className="text-xs font-normal text-muted-foreground">
            Nome e telefone são hasheados pela GeckoAPI por conformidade LGPD — servem para
            identificar o mesmo vendedor entre anúncios, não para contato direto. Para falar com
            ele, use o botão <em>Abrir na OLX</em> acima.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">ID público do vendedor</div>
            <code className="mt-0.5 break-all text-xs">{listing.seller_id ?? "—"}</code>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Nome</div>
            {listing.seller_name_hash ? (
              <div className="mt-1"><HashBadge hash={listing.seller_name_hash} kind="name" /></div>
            ) : <div>—</div>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Profissional:</span>
            {listing.seller_is_professional == null ? "—" : <Badge>{listing.seller_is_professional ? "sim" : "não"}</Badge>}
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Telefones</div>
            {listing.phone_hashes && listing.phone_hashes.length > 0 ? (
              <ul className="mt-1 space-y-2">
                {listing.phone_hashes.map((h) => (
                  <li key={h}><HashBadge hash={h} kind="phone" /></li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Este anúncio não expôs telefones no momento da extração.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Atributos</CardTitle></CardHeader>
        <CardContent>
          {attrs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem atributos.</p>
          ) : (
            <dl className="grid gap-2 sm:grid-cols-2">
              {attrs.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-border/50 pb-1 text-sm">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Rastreio da extração</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <Info label="requestId" value={listing.request_id ?? "—"} />
          <Info label="executionId" value={listing.execution_id ?? "—"} />
          <Info label="extractedAt" value={formatDate(listing.extracted_at)} />
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
