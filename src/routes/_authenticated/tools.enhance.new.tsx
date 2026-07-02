import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { X } from "lucide-react";
import { toast } from "sonner";
import { QualityPicker, QUALITY_COST_USD, type EnhanceQuality } from "@/components/QualityPicker";

export const Route = createFileRoute("/_authenticated/tools/enhance/new")({
  head: () => ({ meta: [{ title: "Novo lote de fotos" }] }),
  component: NewBatch,
});

const MAX_FILES = 20;
const MAX_SIZE = 15 * 1024 * 1024;


function NewBatch() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"enhance" | "watermark_only">("enhance");
  const [quality, setQuality] = useState<EnhanceQuality>("low");
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);


  const onPick = useCallback((list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => {
      if (!/^image\/(jpeg|jpg|png|webp)$/i.test(f.type)) {
        toast.error(`Formato não suportado: ${f.name}`);
        return false;
      }
      if (f.size > MAX_SIZE) {
        toast.error(`${f.name} excede 15MB`);
        return false;
      }
      return true;
    });
    setFiles((prev) => {
      const merged = [...prev, ...incoming].slice(0, MAX_FILES);
      if (prev.length + incoming.length > MAX_FILES) {
        toast.warning(`Máximo de ${MAX_FILES} fotos por lote`);
      }
      return merged;
    });
  }, []);

  const remove = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const start = async () => {
    if (files.length === 0) return;
    const cost = QUALITY_COST_USD[quality];
    if (!window.confirm(
      `${files.length} foto(s) serão processadas pela IA.\nQualidade: ${quality === "medium" ? "Média" : "Baixa"}\nCusto estimado: US$ ${(files.length * cost).toFixed(2)} (~US$ ${cost.toFixed(2)}/foto).\nContinuar?`
    )) return;


    setProcessing(true);
    setProgress({ done: 0, total: files.length });
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Sessão expirada");

      const finalName = name.trim() || `Lote ${new Date().toLocaleString("pt-BR")}`;
      const { data: batch, error: bErr } = await supabase
        .from("photo_batches")
        .insert({ user_id: userId, name: finalName, mode, status: "processing", image_count: files.length })
        .select("id")
        .single();
      if (bErr || !batch) throw bErr ?? new Error("Falha ao criar lote");
      const batchId = batch.id as string;

      // Upload originais
      const imageIds: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const imageId = crypto.randomUUID();
        const path = `${userId}/uploads/${batchId}/original/${imageId}.${ext}`;
        const { error: upErr } = await supabase.storage.from("olx-images").upload(path, f, {
          contentType: f.type, upsert: false,
        });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from("photo_batch_images").insert({
          id: imageId,
          batch_id: batchId,
          user_id: userId,
          position: i,
          original_storage_path: path,
          original_filename: f.name,
        });
        if (insErr) throw insErr;
        imageIds.push(imageId);
      }

      // Processa em lotes de 2 (MAX_PER_CALL)
      const BATCH = 2;
      let done = 0;
      for (let i = 0; i < imageIds.length; i += BATCH) {
        const chunk = imageIds.slice(i, i + BATCH);
        const { error } = await supabase.functions.invoke("enhance-listing-images", {
          body: { batch_id: batchId, image_ids: chunk, mode, quality },
        });
        if (error) throw error;
        done += chunk.length;
        setProgress({ done, total: imageIds.length });
      }

      await supabase.from("photo_batches").update({ status: "done" }).eq("id", batchId);
      toast.success("Lote processado");
      navigate({ to: "/tools/enhance/$id", params: { id: batchId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao processar lote");
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  };

  const perFotoCost = QUALITY_COST_USD[quality];
  const totalCost = (files.length * perFotoCost).toFixed(2);


  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Novo lote de fotos</h1>
        <p className="text-sm text-muted-foreground">Envie até {MAX_FILES} fotos (JPG/PNG/WebP, 15MB cada) para a IA processar.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Configurações</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do lote (opcional)</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Casa do bairro X" disabled={processing} />
          </div>
          <div className="space-y-2">
            <Label>Modo de processamento</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as "enhance" | "watermark_only")} disabled={processing}>
              <div className="flex items-start gap-2 rounded-md border p-3">
                <RadioGroupItem value="enhance" id="m-enh" className="mt-1" />
                <Label htmlFor="m-enh" className="flex-1 cursor-pointer font-normal">
                  <div className="font-medium">Tratar completo (paisagem 3:2)</div>
                  <div className="text-xs text-muted-foreground">Melhora exposição, remove marca d'água e reenquadra para horizontal.</div>
                </Label>
              </div>
              <div className="flex items-start gap-2 rounded-md border p-3">
                <RadioGroupItem value="watermark_only" id="m-wm" className="mt-1" />
                <Label htmlFor="m-wm" className="flex-1 cursor-pointer font-normal">
                  <div className="font-medium">Apenas remover marca d'água</div>
                  <div className="text-xs text-muted-foreground">Preserva enquadramento, cores e nitidez. Só apaga logos/selos.</div>
                </Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fotos ({files.length}/{MAX_FILES})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            disabled={processing || files.length >= MAX_FILES}
            onChange={(e) => { onPick(e.target.files); e.target.value = ""; }}
          />
          {(() => {
            const disabled = processing || files.length >= MAX_FILES;
            const open = () => { if (!disabled) inputRef.current?.click(); };
            return (
              <div
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled}
                onClick={open}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
                onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragActive(true); }}
                onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  if (!disabled) onPick(e.dataTransfer.files);
                }}
                className={`flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-sm text-muted-foreground transition-colors ${
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/50"
                } ${dragActive ? "border-primary bg-primary/5 text-foreground" : ""}`}
              >
                {files.length >= MAX_FILES
                  ? `Máximo de ${MAX_FILES} fotos atingido`
                  : "Clique para selecionar fotos ou arraste aqui"}
              </div>
            );
          })()}

          {files.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {files.map((f, idx) => (
                <div key={idx} className="group relative aspect-square overflow-hidden rounded bg-muted">
                  <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                  {!processing && (
                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      className="absolute right-1 top-1 rounded bg-destructive/90 p-1 text-destructive-foreground opacity-0 group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3 text-sm">
        <div>
          Custo estimado: <strong>US$ {totalCost}</strong>{" "}
          <span className="text-muted-foreground">(~US$ {perFotoCost.toFixed(2)} por foto · qualidade {quality === "medium" ? "média" : "baixa"})</span>
        </div>
        <Button onClick={start} disabled={processing || files.length === 0}>
          {processing
            ? progress ? `Processando ${progress.done}/${progress.total}…` : "Processando…"
            : "Enviar e processar"}
        </Button>
      </div>
    </div>
  );
}
