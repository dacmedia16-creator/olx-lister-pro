import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckSquare, Download, Eraser, ExternalLink, ImageOff, RefreshCw, Sparkles, Square, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";
import { formatBRL, formatDate } from "@/lib/olx";
import { HashBadge } from "@/components/HashBadge";
import { OlxImageCarousel } from "@/components/OlxImageCarousel";
import { ImageLightbox } from "@/components/ImageLightbox";

import { deleteListing } from "@/lib/delete-listing";
import { deleteListingImage } from "@/lib/delete-listing-image";
import { downloadEnhanced, downloadEnhancedZip, getEnhancedSignedUrl } from "@/lib/enhanced-images";
import { QualityPicker, QUALITY_COST_USD, type EnhanceQuality } from "@/components/QualityPicker";


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
  images_source: string | null;
  source_portal: string | null;
};

type Image = {
  id: string;
  original_external_url: string | null;
  original_storage_path: string | null;
  status: string;
  position: number | null;
  enhanced_storage_path: string | null;
  enhancement_status: string | null;
};

function ListingDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState<Listing | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [reimporting, setReimporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [showEnhanced, setShowEnhanced] = useState(true);
  const [enhancedUrls, setEnhancedUrls] = useState<Record<string, string>>({});
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());




  const load = useCallback(async () => {
    const { data } = await supabase.from("olx_listings").select("*").eq("id", id).maybeSingle();
    setListing(data as Listing | null);
    const { data: imgs } = await supabase
      .from("listing_images")
      .select("id,original_external_url,original_storage_path,status,position,enhanced_storage_path,enhancement_status")
      .eq("listing_id", id)
      .order("position", { ascending: true });
    setImages((imgs as Image[]) ?? []);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Resolve signed URLs para as imagens tratadas
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map: Record<string, string> = {};
      for (const im of images) {
        if (im.enhanced_storage_path && im.enhancement_status === "done") {
          const u = await getEnhancedSignedUrl(im.enhanced_storage_path);
          if (u) map[im.id] = u;
        }
      }
      if (!cancelled) setEnhancedUrls(map);
    })();
    return () => { cancelled = true; };
  }, [images]);


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

  const [enhanceProgress, setEnhanceProgress] = useState<{ done: number; total: number } | null>(null);
  const [enhancingIds, setEnhancingIds] = useState<Set<string>>(new Set());

  const enhanceOne = useCallback(async (imageId: string, mode: "enhance" | "watermark_only" = "enhance", quality: EnhanceQuality = "low") => {
    setEnhancingIds((prev) => { const n = new Set(prev); n.add(imageId); return n; });
    try {
      const { data, error } = await supabase.functions.invoke("enhance-listing-images", {
        body: { listing_id: id, image_ids: [imageId], mode, quality },
      });
      if (error) throw error;
      const r = (data as { results?: Array<{ ok: boolean; error?: string }> })?.results?.[0];
      if (r && !r.ok) throw new Error(r.error || "Falha ao tratar");
      await load();
      toast.success(mode === "watermark_only" ? "Marca d'água removida" : "Foto tratada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao processar foto");
    } finally {
      setEnhancingIds((prev) => { const n = new Set(prev); n.delete(imageId); return n; });
    }
  }, [id, load]);


  const [deletingImageIds, setDeletingImageIds] = useState<Set<string>>(new Set());
  const removeImage = useCallback(async (imageId: string) => {
    if (!window.confirm("Excluir esta foto? Esta ação não pode ser desfeita.")) return;
    setDeletingImageIds((prev) => { const n = new Set(prev); n.add(imageId); return n; });
    try {
      await deleteListingImage(imageId);
      await load();
      toast.success("Foto excluída");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir foto");
    } finally {
      setDeletingImageIds((prev) => { const n = new Set(prev); n.delete(imageId); return n; });
    }
  }, [load]);

  const enhance = useCallback(async (mode: "enhance" | "watermark_only" = "enhance", quality: EnhanceQuality = "low", overrideIds?: string[]) => {
    setEnhancing(true);
    setEnhanceProgress(null);
    try {
      let queue: string[];
      if (overrideIds && overrideIds.length > 0) {
        queue = overrideIds;
      } else {
        const { data: allImgs } = await supabase
          .from("listing_images")
          .select("id,original_external_url")
          .eq("listing_id", id)
          .order("position", { ascending: true });
        queue = (allImgs ?? [])
          .filter((i: any) => i.original_external_url)
          .map((i: any) => i.id as string);
      }
      if (queue.length === 0) {
        toast.error("Nenhuma foto disponível para processar");
        return;
      }
      const total = queue.length;
      let done = 0;
      let ok = 0;
      const BATCH = 2;
      setEnhanceProgress({ done: 0, total });
      for (let i = 0; i < queue.length; i += BATCH) {
        const batch = queue.slice(i, i + BATCH);
        const { data, error } = await supabase.functions.invoke("enhance-listing-images", {
          body: { listing_id: id, image_ids: batch, mode, quality },
        });

        if (error) throw error;
        const results = (data as { results?: Array<{ ok: boolean }> })?.results ?? [];
        ok += results.filter((r) => r.ok).length;
        done += batch.length;
        setEnhanceProgress({ done, total });
        await load();
      }
      toast.success(
        mode === "watermark_only"
          ? `Marca d'água removida: ${ok}/${total}`
          : `Fotos tratadas: ${ok}/${total}`,
      );
      setSelectionMode(false);
      setSelectedIds(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao processar fotos");
    } finally {
      setEnhancing(false);
      setEnhanceProgress(null);
    }
  }, [id, load]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [confirmMode, setConfirmMode] = useState<"enhance" | "watermark_only">("enhance");
  const [confirmQuality, setConfirmQuality] = useState<EnhanceQuality>("low");
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);


  const openEnhanceConfirm = useCallback(async (mode: "enhance" | "watermark_only" = "enhance", overrideIds?: string[]) => {
    let count: number;
    if (overrideIds && overrideIds.length > 0) {
      count = overrideIds.length;
      setConfirmIds(overrideIds);
    } else {
      const { data: allImgs, error } = await supabase
        .from("listing_images")
        .select("id,original_external_url")
        .eq("listing_id", id);
      if (error) {
        toast.error("Falha ao contar fotos");
        return;
      }
      count = (allImgs ?? []).filter((i: any) => i.original_external_url).length;
      setConfirmIds(null);
    }
    if (count === 0) {
      toast.error("Nenhuma foto disponível para processar");
      return;
    }
    setConfirmMode(mode);
    setPendingCount(count);
    setConfirmOpen(true);
  }, [id]);




  const enhancedList = useMemo(
    () => images.filter((i) => i.enhanced_storage_path && i.enhancement_status === "done"),
    [images],
  );

  const downloadAll = useCallback(async () => {
    if (enhancedList.length === 0) return;
    setDownloadingZip(true);
    try {
      const items = enhancedList.map((im, idx) => ({
        path: im.enhanced_storage_path!,
        name: `foto-${String(idx + 1).padStart(2, "0")}.png`,
      }));
      await downloadEnhancedZip(items, `anuncio-${id}.zip`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar ZIP");
    } finally {
      setDownloadingZip(false);
    }
  }, [enhancedList, id]);

  if (!listing) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  const attrs = listing.attributes_json && typeof listing.attributes_json === "object"
    ? Object.entries(listing.attributes_json as Record<string, unknown>)
    : [];

  const hasImages = images.length > 0;
  const hasAnyEnhanced = enhancedList.length > 0;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteListing(id);
      toast.success("Anúncio excluído");
      navigate({ to: "/listings" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
      setDeleting(false);
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/listings" className="text-sm text-muted-foreground hover:underline">← Voltar</Link>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={deleting}>
              <Trash2 className="mr-2 h-4 w-4" />
              {deleting ? "Excluindo..." : "Excluir anúncio"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir este anúncio?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. As imagens armazenadas também serão removidas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-[11px] font-semibold text-white ${listing.source_portal === "zap" ? "bg-blue-600" : "bg-purple-600"}`}>
              {listing.source_portal === "zap" ? "ZAP Imóveis" : "OLX"}
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">{listing.title ?? "(sem título)"}</h1>
          </div>
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
            <ExternalLink className="h-3.5 w-3.5" /> {listing.source_portal === "zap" ? "Abrir no ZAP Imóveis" : "Abrir na OLX"}
          </a>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>Fotos</CardTitle>
          {hasImages && !selectionMode && (
            <div className="flex flex-wrap items-center gap-2">
              {hasAnyEnhanced && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowEnhanced((v) => !v)}
                >
                  {showEnhanced ? "Ver originais" : "Ver tratadas"}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setSelectionMode(true)} disabled={enhancing}>
                <CheckSquare className="mr-2 h-4 w-4" />
                Selecionar
              </Button>
              <Button size="sm" variant="outline" onClick={() => openEnhanceConfirm("watermark_only")} disabled={enhancing}>
                <Eraser className={`mr-2 h-4 w-4 ${enhancing ? "animate-pulse" : ""}`} />
                Remover marca d'água
              </Button>
              <Button size="sm" onClick={() => openEnhanceConfirm("enhance")} disabled={enhancing}>
                <Sparkles className={`mr-2 h-4 w-4 ${enhancing ? "animate-pulse" : ""}`} />
                {enhancing
                  ? enhanceProgress
                    ? `Processando ${enhanceProgress.done}/${enhanceProgress.total}...`
                    : "Processando..."
                  : hasAnyEnhanced ? "Retratar com IA" : "Tratar fotos com IA"}
              </Button>

              {hasAnyEnhanced && (
                <Button size="sm" variant="secondary" onClick={downloadAll} disabled={downloadingZip}>
                  <Download className="mr-2 h-4 w-4" />
                  {downloadingZip ? "Gerando ZIP..." : `Baixar ZIP (${enhancedList.length})`}
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!hasImages ? (
            <div className="flex flex-col items-start gap-3 rounded-md border border-dashed p-6">
              <div className="flex items-center gap-2">
                <ImageOff className="h-5 w-5 text-muted-foreground" />
                <p className="font-medium">Fotos indisponíveis</p>
              </div>
              <p className="text-sm text-muted-foreground">
                A GeckoAPI retornou 0 imagens para este anúncio, mesmo após o fallback de busca PLP. Tente
                reimportar mais tarde ou veja as fotos direto no site da OLX.
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
            <div className="space-y-3">
              {listing.images_source && listing.images_source !== "pdp" && listing.images_source !== "pdp_retry" && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                  As fotos deste anúncio foram obtidas por fallback ({listing.images_source}) porque o PDP oficial retornou vazio. Podem estar desatualizadas — confirme na OLX.
                </div>
              )}
              <OlxImageCarousel
                urls={images
                  .map((i) => (showEnhanced && enhancedUrls[i.id]) || i.original_external_url)
                  .filter((u): u is string => !!u)}
                alt={listing.title ?? ""}
                className="rounded-md"
                onImageClick={(i) => setLightboxIndex(i)}
              />
              {images.length > 0 && (
                <>
                <p className="text-xs text-muted-foreground">
                  Clique na foto para ampliar. Use os botões em cada foto para tratar, remover marca d'água ou excluir individualmente.
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {images.map((im, idx) => {
                    const enhUrl = enhancedUrls[im.id];
                    const displaySrc = (showEnhanced && enhUrl) || im.original_external_url;
                    const isEnhanced = !!enhUrl && showEnhanced;
                    const isProcessing = im.enhancement_status === "processing" || enhancingIds.has(im.id);
                    const canEnhance = !!im.original_external_url;
                    const isDeleting = deletingImageIds.has(im.id);
                    return (
                      <div key={im.id} className="relative aspect-square overflow-hidden rounded bg-muted">
                        {displaySrc ? (
                          <img
                            src={displaySrc}
                            alt=""
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            onClick={() => setLightboxIndex(idx)}
                            className="h-full w-full cursor-zoom-in object-cover"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                            {im.status === "failed" ? "falhou" : "—"}
                          </div>
                        )}

                        {isProcessing && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] text-white">
                            tratando…
                          </div>
                        )}
                        {im.enhancement_status === "failed" && !isProcessing && (
                          <div className="absolute left-1 top-1 rounded bg-destructive px-1 text-[10px] text-destructive-foreground">falhou</div>
                        )}
                        {isEnhanced && (
                          <div className="absolute left-1 top-1 rounded bg-primary px-1 text-[10px] text-primary-foreground">IA</div>
                        )}
                        {!isProcessing && (
                          <div className="absolute inset-x-0 bottom-0 flex items-stretch justify-between gap-px bg-black/60 backdrop-blur-sm">
                            {canEnhance ? (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); enhanceOne(im.id, "enhance"); }}
                                  disabled={enhancing || isDeleting}
                                  title={isEnhanced ? "Retratar com IA" : "Tratar com IA"}
                                  aria-label={isEnhanced ? "Retratar com IA" : "Tratar com IA"}
                                  className="flex min-h-7 flex-1 items-center justify-center gap-1 px-1 py-1 text-[10px] text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <Sparkles className="h-3 w-3" />
                                  <span className="hidden sm:inline">{isEnhanced ? "Retratar" : "Tratar"}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); enhanceOne(im.id, "watermark_only"); }}
                                  disabled={enhancing || isDeleting}
                                  title="Remover apenas marca d'água"
                                  aria-label="Remover apenas marca d'água"
                                  className="flex min-h-7 flex-1 items-center justify-center gap-1 border-l border-white/10 px-1 py-1 text-[10px] text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <Eraser className="h-3 w-3" />
                                  <span className="hidden sm:inline">Marca</span>
                                </button>
                              </>
                            ) : (
                              <div className="flex-1" />
                            )}
                            {isEnhanced && im.enhanced_storage_path && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); downloadEnhanced(im.enhanced_storage_path!, `foto-${String(idx + 1).padStart(2, "0")}.png`); }}
                                title="Baixar foto tratada"
                                aria-label="Baixar foto tratada"
                                className="flex min-h-7 w-8 items-center justify-center border-l border-white/10 text-white hover:bg-white/10"
                              >
                                <Download className="h-3 w-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeImage(im.id); }}
                              disabled={isDeleting}
                              title="Excluir foto"
                              aria-label="Excluir foto"
                              className="flex min-h-7 w-8 items-center justify-center border-l border-white/10 text-destructive-foreground hover:bg-destructive/80 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}


                      </div>
                    );
                  })}
                </div>
                </>
              )}
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

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmMode === "watermark_only" ? "Confirmar remoção de marca d'água" : "Confirmar tratamento com IA"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  <strong>{pendingCount}</strong> foto(s) serão processadas pela OpenAI.
                </div>
                {confirmMode === "watermark_only" && (
                  <div className="text-muted-foreground">
                    Este modo apaga apenas logos/selos dos portais (OLX, ZAP, Viva Real) e mantém o resto da foto igual — mesma orientação, cores, enquadramento e nitidez.
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <div className="text-sm font-medium">Qualidade da IA</div>
            <QualityPicker value={confirmQuality} onChange={setConfirmQuality} />
          </div>
          <div className="rounded-md bg-muted/40 p-2 text-sm">
            Custo estimado:{" "}
            <strong>US$ {(pendingCount * QUALITY_COST_USD[confirmQuality]).toFixed(2)}</strong>{" "}
            <span className="text-muted-foreground">
              (~US$ {QUALITY_COST_USD[confirmQuality].toFixed(2)} por foto)
            </span>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); void enhance(confirmMode, confirmQuality); }}>
              {confirmMode === "watermark_only" ? "Confirmar e remover" : "Confirmar e tratar"}
            </AlertDialogAction>
          </AlertDialogFooter>

        </AlertDialogContent>
      </AlertDialog>
      <ImageLightbox
        images={images
          .map((i) => (showEnhanced && enhancedUrls[i.id]) || i.original_external_url)
          .filter((u): u is string => !!u)}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onChangeIndex={setLightboxIndex}
      />
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
