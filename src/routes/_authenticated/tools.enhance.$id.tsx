import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Eraser, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { downloadEnhanced, downloadEnhancedZip, getEnhancedSignedUrl } from "@/lib/enhanced-images";
import { deleteBatchImage } from "@/lib/delete-batch";
import { QualityPicker, QUALITY_COST_USD, type EnhanceQuality } from "@/components/QualityPicker";

export const Route = createFileRoute("/_authenticated/tools/enhance/$id")({
  head: () => ({ meta: [{ title: "Lote de fotos" }] }),
  component: BatchDetail,
});

type Batch = { id: string; name: string; mode: "enhance" | "watermark_only"; status: string; image_count: number };
type Img = {
  id: string;
  position: number;
  original_storage_path: string;
  enhanced_storage_path: string | null;
  enhancement_status: string;
  original_filename: string | null;
  error_message: string | null;
};


const COST = 0.02;

function BatchDetail() {
  const { id } = Route.useParams();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [imgs, setImgs] = useState<Img[]>([]);
  const [origUrls, setOrigUrls] = useState<Record<string, string>>({});
  const [enhUrls, setEnhUrls] = useState<Record<string, string>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"enhance" | "watermark_only">("enhance");
  const [confirmScope, setConfirmScope] = useState<{ kind: "all" } | { kind: "one"; imageId: string }>({ kind: "all" });
  const [quality, setQuality] = useState<EnhanceQuality>("low");


  const load = useCallback(async () => {
    const { data: b } = await supabase.from("photo_batches").select("*").eq("id", id).maybeSingle();
    setBatch(b as Batch | null);
    const { data: ims } = await supabase
      .from("photo_batch_images")
      .select("id,position,original_storage_path,enhanced_storage_path,enhancement_status,original_filename,error_message")
      .eq("batch_id", id)
      .order("position", { ascending: true });
    setImgs((ims as Img[]) ?? []);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const oMap: Record<string, string> = {};
      const eMap: Record<string, string> = {};
      for (const im of imgs) {
        const o = await getEnhancedSignedUrl(im.original_storage_path);
        if (o) oMap[im.id] = o;
        if (im.enhanced_storage_path && im.enhancement_status === "done") {
          const e = await getEnhancedSignedUrl(im.enhanced_storage_path);
          if (e) eMap[im.id] = e;
        }
      }
      if (!cancelled) { setOrigUrls(oMap); setEnhUrls(eMap); }
    })();
    return () => { cancelled = true; };
  }, [imgs]);

  const doneList = useMemo(() => imgs.filter((i) => i.enhanced_storage_path && i.enhancement_status === "done"), [imgs]);

  const processOne = useCallback(async (imageId: string, mode: "enhance" | "watermark_only", q: EnhanceQuality) => {
    setBusyIds((p) => { const n = new Set(p); n.add(imageId); return n; });
    try {
      const { data, error } = await supabase.functions.invoke("enhance-listing-images", {
        body: { batch_id: id, image_ids: [imageId], mode, quality: q },
      });
      if (error) throw error;
      const r = (data as { results?: Array<{ ok: boolean; error?: string }> })?.results?.[0];
      if (r && !r.ok) throw new Error(r.error || "Falha");
      await load();
      toast.success(mode === "watermark_only" ? "Marca removida" : "Foto tratada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusyIds((p) => { const n = new Set(p); n.delete(imageId); return n; });
    }
  }, [id, load]);

  const reprocessAll = useCallback(async (mode: "enhance" | "watermark_only", q: EnhanceQuality) => {
    const ids = imgs.map((i) => i.id);
    if (ids.length === 0) return;
    setProcessing(true);
    try {
      const BATCH = 2;
      for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH);
        const { error } = await supabase.functions.invoke("enhance-listing-images", {
          body: { batch_id: id, image_ids: chunk, mode, quality: q },
        });
        if (error) throw error;
        await load();
      }
      toast.success("Reprocessamento concluído");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    } finally {
      setProcessing(false);
    }
  }, [id, imgs, load]);

  const openConfirm = (mode: "enhance" | "watermark_only", scope: { kind: "all" } | { kind: "one"; imageId: string }) => {
    setConfirmMode(mode);
    setConfirmScope(scope);
    setQuality("low");
    setConfirmOpen(true);
  };

  const confirmCount = confirmScope.kind === "one" ? 1 : imgs.length;
  const confirmCost = (confirmCount * QUALITY_COST_USD[quality]).toFixed(2);

  const runConfirmed = () => {
    setConfirmOpen(false);
    if (confirmScope.kind === "one") {
      void processOne(confirmScope.imageId, confirmMode, quality);
    } else {
      void reprocessAll(confirmMode, quality);
    }
  };


  const removeImg = async (imageId: string) => {
    if (!window.confirm("Excluir esta foto do lote?")) return;
    try {
      await deleteBatchImage(imageId);
      await load();
      toast.success("Foto excluída");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    }
  };

  const downloadAll = async () => {
    if (doneList.length === 0) return;
    setZipping(true);
    try {
      const items = doneList.map((im, idx) => ({
        path: im.enhanced_storage_path!,
        name: `foto-${String(idx + 1).padStart(2, "0")}.png`,
      }));
      await downloadEnhancedZip(items, `lote-${id}.zip`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ZIP");
    } finally {
      setZipping(false);
    }
  };

  if (!batch) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/tools/enhance" className="text-sm text-muted-foreground hover:underline">← Voltar</Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{batch.name}</h1>
        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{batch.mode === "watermark_only" ? "Marca d'água" : "Tratar completo"}</Badge>
          <span>{imgs.length} foto(s)</span>
          <span>· {doneList.length} tratada(s)</span>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>Fotos</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => reprocessAll("watermark_only")} disabled={processing || imgs.length === 0}>
              <Eraser className="mr-2 h-4 w-4" /> Remover marca (todos)
            </Button>
            <Button size="sm" onClick={() => reprocessAll("enhance")} disabled={processing || imgs.length === 0}>
              <Sparkles className="mr-2 h-4 w-4" /> Tratar (todos)
            </Button>
            {doneList.length > 0 && (
              <Button size="sm" variant="secondary" onClick={downloadAll} disabled={zipping}>
                <Download className="mr-2 h-4 w-4" /> {zipping ? "Gerando…" : `Baixar ZIP (${doneList.length})`}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {imgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma foto neste lote.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {imgs.map((im, idx) => {
                const isBusy = busyIds.has(im.id) || im.enhancement_status === "processing";
                const eUrl = enhUrls[im.id];
                const oUrl = origUrls[im.id];
                return (
                  <div key={im.id} className="rounded-md border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        #{idx + 1} · {im.original_filename ?? "—"}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => removeImg(im.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="mb-1 text-[10px] uppercase text-muted-foreground">Original</div>
                        <div className="aspect-square overflow-hidden rounded bg-muted">
                          {oUrl && <img src={oUrl} alt="" className="h-full w-full object-cover" />}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-[10px] uppercase text-muted-foreground">
                          <span>Tratada</span>
                          {im.enhancement_status === "failed" && <span className="text-destructive">falhou</span>}
                        </div>
                        <div className="relative aspect-square overflow-hidden rounded bg-muted">
                          {eUrl ? (
                            <img src={eUrl} alt="" className="h-full w-full object-cover" />
                          ) : isBusy ? (
                            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">processando…</div>
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">—</div>
                          )}
                        </div>
                      </div>
                    </div>
                    {im.error_message && <p className="mt-1 text-[11px] text-destructive">{im.error_message}</p>}
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => processOne(im.id, "enhance")} disabled={isBusy || processing}>
                        <Sparkles className="mr-1 h-3 w-3" /> Tratar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => processOne(im.id, "watermark_only")} disabled={isBusy || processing}>
                        <Eraser className="mr-1 h-3 w-3" /> Marca
                      </Button>
                      {eUrl && (
                        <Button size="sm" variant="secondary" onClick={() => downloadEnhanced(im.enhanced_storage_path!, `foto-${String(idx + 1).padStart(2, "0")}.png`)}>
                          <Download className="mr-1 h-3 w-3" /> Baixar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
