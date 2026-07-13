import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eraser, Loader2, Sparkles, Trash2 } from "lucide-react";
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
import { QualityPicker, QUALITY_COST_USD, type EnhanceQuality } from "@/components/QualityPicker";

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
  const [photoStats, setPhotoStats] = useState<Record<string, { total: number; enhanced: number }>>({});
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [portal, setPortal] = useState<"" | "olx" | "zap" | "viva">("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Enhance dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogListing, setDialogListing] = useState<Row | null>(null);
  const [dialogMode, setDialogMode] = useState<"enhance" | "watermark_only">("enhance");
  const [dialogQuality, setDialogQuality] = useState<EnhanceQuality>("low");
  const [dialogCount, setDialogCount] = useState(0);
  const [dialogLoadingCount, setDialogLoadingCount] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

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
    if (ids.length === 0) { setThumbs({}); setPhotoStats({}); return; }
    (async () => {
      const { data } = await supabase
        .from("listing_images")
        .select("listing_id,original_external_url,position,enhanced_storage_path")
        .in("listing_id", ids)
        .order("position", { ascending: true });
      const first: Record<string, string> = {};
      const stats: Record<string, { total: number; enhanced: number }> = {};
      for (const im of (data as (Img & { enhanced_storage_path: string | null })[]) ?? []) {
        if (!first[im.listing_id] && im.original_external_url) first[im.listing_id] = im.original_external_url;
        const s = stats[im.listing_id] ?? { total: 0, enhanced: 0 };
        s.total += 1;
        if (im.enhanced_storage_path) s.enhanced += 1;
        stats[im.listing_id] = s;
      }
      setThumbs(first);
      setPhotoStats(stats);
    })();
  }, [ids]);

  const openEnhanceDialog = useCallback(async (listing: Row, mode: "enhance" | "watermark_only") => {
    setDialogListing(listing);
    setDialogMode(mode);
    setDialogQuality("low");
    setDialogCount(0);
    setDialogLoadingCount(true);
    setDialogOpen(true);
    try {
      const { data, error } = await supabase
        .from("listing_images")
        .select("id,original_external_url")
        .eq("listing_id", listing.id);
      if (error) throw error;
      const count = (data ?? []).filter((i: any) => i.original_external_url).length;
      setDialogCount(count);
    } catch (e) {
      toast.error("Falha ao contar fotos");
      setDialogOpen(false);
    } finally {
      setDialogLoadingCount(false);
    }
  }, []);

  const runEnhance = useCallback(async () => {
    if (!dialogListing) return;
    const listingId = dialogListing.id;
    const mode = dialogMode;
    const quality = dialogQuality;
    setDialogOpen(false);
    setProcessingIds((prev) => { const n = new Set(prev); n.add(listingId); return n; });
    try {
      const { data: allImgs } = await supabase
        .from("listing_images")
        .select("id,original_external_url")
        .eq("listing_id", listingId)
        .order("position", { ascending: true });
      const queue = (allImgs ?? [])
        .filter((i: any) => i.original_external_url)
        .map((i: any) => i.id as string);
      if (queue.length === 0) {
        toast.error("Nenhuma foto disponível para processar");
        return;
      }
      const total = queue.length;
      let ok = 0;
      const BATCH = 2;
      for (let i = 0; i < queue.length; i += BATCH) {
        const batch = queue.slice(i, i + BATCH);
        const { data, error } = await supabase.functions.invoke("enhance-listing-images", {
          body: { listing_id: listingId, image_ids: batch, mode, quality },
        });
        if (error) throw error;
        const results = (data as { results?: Array<{ ok: boolean }> })?.results ?? [];
        ok += results.filter((r) => r.ok).length;
      }
      toast.success(
        mode === "watermark_only"
          ? `Marca d'água removida: ${ok}/${total}`
          : `Fotos tratadas: ${ok}/${total}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao processar fotos");
    } finally {
      setProcessingIds((prev) => { const n = new Set(prev); n.delete(listingId); return n; });
    }
  }, [dialogListing, dialogMode, dialogQuality]);

  const dialogCost = (dialogCount * QUALITY_COST_USD[dialogQuality]).toFixed(2);

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
              onChange={(e) => setPortal(e.target.value as "" | "olx" | "zap" | "viva")}
            >
              <option value="">Todos</option>
              <option value="olx">OLX</option>
              <option value="zap">ZAP Imóveis</option>
              <option value="viva">Viva Real</option>
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
          {rows.map((l) => {
            const isProcessing = processingIds.has(l.id);
            return (
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
                      <span className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur ${l.source_portal === "zap" ? "bg-blue-600/90" : l.source_portal === "viva" ? "bg-amber-600/90" : "bg-purple-600/90"}`}>
                        {l.source_portal === "zap" ? "ZAP" : l.source_portal === "viva" ? "VIVA" : "OLX"}
                      </span>
                      {photoStats[l.id]?.enhanced ? (
                        <span
                          className={`absolute left-2 bottom-2 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white shadow ${
                            photoStats[l.id].enhanced === photoStats[l.id].total
                              ? "bg-emerald-600/90"
                              : "bg-fuchsia-600/90"
                          }`}
                          title="Fotos tratadas por IA"
                        >
                          IA {photoStats[l.id].enhanced}/{photoStats[l.id].total}
                        </span>
                      ) : null}
                      {isProcessing && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                      )}
                    </div>
                    <CardContent className="space-y-1 py-3">
                      <div className="line-clamp-2 text-sm font-medium">{l.title ?? "(sem título)"}</div>
                      <div className="text-base font-semibold">{formatBRL(l.price)}</div>
                      <div className="text-xs text-muted-foreground">
                        {[l.neighborhood, l.city].filter(Boolean).join(" · ") || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">{l.category ?? "—"}</div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Publicado: {formatDate(l.listed_at ?? l.created_at)}</span>
                        {photoStats[l.id]?.total ? (
                          <span>{photoStats[l.id].enhanced}/{photoStats[l.id].total} tratadas</span>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                {/* Action bar */}
                <div className="absolute right-2 top-2 flex gap-1">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8 shadow"
                    disabled={isProcessing}
                    aria-label="Tratar fotos com IA"
                    title="Tratar fotos"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); void openEnhanceDialog(l, "enhance"); }}
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8 shadow"
                    disabled={isProcessing}
                    aria-label="Remover marca d'água"
                    title="Remover marca d'água"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); void openEnhanceDialog(l, "watermark_only"); }}
                  >
                    <Eraser className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-8 w-8 shadow"
                        disabled={deletingId === l.id || isProcessing}
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
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialogMode === "watermark_only" ? "Remover marca d'água" : "Tratar fotos com IA"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialogLoadingCount
                ? "Contando fotos…"
                : `${dialogCount} foto(s) do anúncio "${dialogListing?.title ?? ""}" serão processadas pela OpenAI.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <div className="text-sm font-medium">Qualidade da IA</div>
            <QualityPicker value={dialogQuality} onChange={setDialogQuality} />
          </div>
          <div className="rounded-md bg-muted/40 p-2 text-sm">
            Custo estimado:{" "}
            <strong>US$ {dialogCost}</strong>{" "}
            <span className="text-muted-foreground">
              (~US$ {QUALITY_COST_USD[dialogQuality].toFixed(2)} por foto)
            </span>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={runEnhance}
              disabled={dialogLoadingCount || dialogCount === 0}
            >
              {dialogMode === "watermark_only" ? "Confirmar e remover" : "Confirmar e tratar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
