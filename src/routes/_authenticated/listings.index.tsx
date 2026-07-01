import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatBRL, formatDate } from "@/lib/olx";
import { deleteListing } from "@/lib/delete-listing";

export const Route = createFileRoute("/_authenticated/listings/")({
  head: () => ({ meta: [{ title: "Anúncios importados" }] }),
  component: ListingsPage,
});

type Row = {
  id: string;
  title: string | null;
  price: number | null;
  city: string | null;
  neighborhood: string | null;
  category: string | null;
  listed_at: string | null;
  created_at: string;
  source_portal: string | null;
};

type Img = { listing_id: string; original_external_url: string | null; position: number | null };

function ListingsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [portal, setPortal] = useState<"" | "olx" | "zap">("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteListing(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("Anúncio excluído");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    (async () => {
      let query = supabase
        .from("olx_listings")
        .select("id,title,price,city,neighborhood,category,listed_at,created_at,source_portal")
        .order("created_at", { ascending: false })
        .limit(200);
      if (city) query = query.ilike("city", `%${city}%`);
      if (neighborhood) query = query.ilike("neighborhood", `%${neighborhood}%`);
      if (category) query = query.ilike("category", `%${category}%`);
      if (q) query = query.ilike("title", `%${q}%`);
      if (min) query = query.gte("price", Number(min));
      if (max) query = query.lte("price", Number(max));
      if (portal) query = query.eq("source_portal", portal);
      const { data } = await query;
      setRows((data as Row[]) ?? []);
    })();
  }, [city, neighborhood, category, q, min, max, portal]);

  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  useEffect(() => {
    if (ids.length === 0) { setThumbs({}); return; }
    (async () => {
      const { data } = await supabase
        .from("listing_images")
        .select("listing_id,original_external_url,position")
        .in("listing_id", ids)
        .order("position", { ascending: true });
      const first: Record<string, string> = {};
      for (const im of (data as Img[]) ?? []) {
        if (!first[im.listing_id] && im.original_external_url) first[im.listing_id] = im.original_external_url;
      }
      setThumbs(first);
    })();
  }, [ids]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Anúncios importados</h1>

      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-6">
          <div className="space-y-1"><Label>Cidade</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
          <div className="space-y-1"><Label>Bairro</Label><Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} /></div>
          <div className="space-y-1"><Label>Categoria</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} /></div>
          <div className="space-y-1"><Label>Título</Label><Input value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="space-y-1"><Label>Preço mín.</Label><Input type="number" value={min} onChange={(e) => setMin(e.target.value)} /></div>
          <div className="space-y-1"><Label>Preço máx.</Label><Input type="number" value={max} onChange={(e) => setMax(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Portal</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={portal}
              onChange={(e) => setPortal(e.target.value as "" | "olx" | "zap")}
            >
              <option value="">Todos</option>
              <option value="olx">OLX</option>
              <option value="zap">ZAP Imóveis</option>
            </select>
          </div>
          <div className="md:col-span-6">
            <Button variant="ghost" size="sm" onClick={() => { setCity(""); setNeighborhood(""); setCategory(""); setQ(""); setMin(""); setMax(""); setPortal(""); }}>Limpar filtros</Button>
          </div>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum anúncio encontrado.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((l) => (
            <div key={l.id} className="relative">
              <Link to="/listings/$id" params={{ id: l.id }} className="block">
                <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
                  <div className="relative aspect-video w-full overflow-hidden bg-muted">
                    {thumbs[l.id] ? (
                      <img src={thumbs[l.id]} alt={l.title ?? ""} referrerPolicy="no-referrer" className="h-full w-full object-cover" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <>
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">sem imagem</div>
                        <span className="absolute right-2 top-2 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur">
                          Sem fotos
                        </span>
                      </>
                    )}
                    <span className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur ${l.source_portal === "zap" ? "bg-blue-600/90" : "bg-purple-600/90"}`}>
                      {l.source_portal === "zap" ? "ZAP" : "OLX"}
                    </span>
                  </div>
                  <CardContent className="space-y-1 py-3">
                    <div className="line-clamp-2 text-sm font-medium">{l.title ?? "(sem título)"}</div>
                    <div className="text-base font-semibold">{formatBRL(l.price)}</div>
                    <div className="text-xs text-muted-foreground">
                      {[l.neighborhood, l.city].filter(Boolean).join(" · ") || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">{l.category ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">Publicado: {formatDate(l.listed_at ?? l.created_at)}</div>
                  </CardContent>
                </Card>
              </Link>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute right-2 top-2 h-8 w-8 shadow"
                    disabled={deletingId === l.id}
                    aria-label="Excluir anúncio"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir este anúncio?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. As imagens armazenadas também serão removidas.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(l.id)}>Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
