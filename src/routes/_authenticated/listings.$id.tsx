import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate } from "@/lib/olx";

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

type Image = { id: string; original_storage_path: string | null; status: string; position: number | null };

function ListingDetail() {
  const { id } = Route.useParams();
  const [listing, setListing] = useState<Listing | null>(null);
  const [images, setImages] = useState<Array<Image & { url?: string }>>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("olx_listings").select("*").eq("id", id).maybeSingle();
      setListing(data as Listing | null);
      const { data: imgs } = await supabase
        .from("listing_images")
        .select("id,original_storage_path,status,position")
        .eq("listing_id", id)
        .order("position", { ascending: true });
      const list = (imgs as Image[]) ?? [];
      const paths = list.map((i) => i.original_storage_path).filter((p): p is string => !!p);
      let signed: Array<{ signedUrl: string | null }> = [];
      if (paths.length > 0) {
        const { data: s } = await supabase.storage.from("olx-images").createSignedUrls(paths, 3600);
        signed = s ?? [];
      }
      const map = new Map(paths.map((p, i) => [p, signed[i]?.signedUrl]));
      setImages(list.map((im) => ({ ...im, url: im.original_storage_path ? map.get(im.original_storage_path) : undefined })));
    })();
  }, [id]);

  if (!listing) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  const attrs = listing.attributes_json && typeof listing.attributes_json === "object"
    ? Object.entries(listing.attributes_json as Record<string, unknown>)
    : [];

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
        <div className="text-right">
          <div className="text-3xl font-semibold">{formatBRL(listing.price)}</div>
          <div className="text-xs text-muted-foreground">Publicado: {formatDate(listing.listed_at)}</div>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Fotos</CardTitle></CardHeader>
        <CardContent>
          {images.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem imagens.</p>
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
        <CardHeader><CardTitle>Vendedor (apenas hashes)</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <div><span className="text-muted-foreground">seller_id: </span><code className="break-all">{listing.seller_id ?? "—"}</code></div>
          <div><span className="text-muted-foreground">nome (hash): </span><code className="break-all">{listing.seller_name_hash ?? "—"}</code></div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">profissional:</span>
            {listing.seller_is_professional == null ? "—" : <Badge>{listing.seller_is_professional ? "sim" : "não"}</Badge>}
          </div>
          <div>
            <div className="text-muted-foreground">telefones (hashes):</div>
            {listing.phone_hashes && listing.phone_hashes.length > 0 ? (
              <ul className="mt-1 space-y-1">
                {listing.phone_hashes.map((h) => <li key={h}><code className="break-all text-xs">{h}</code></li>)}
              </ul>
            ) : <div>—</div>}
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
