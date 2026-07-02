import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteBatch } from "@/lib/delete-batch";
import { formatDate } from "@/lib/olx";

export const Route = createFileRoute("/_authenticated/tools/enhance/")({
  head: () => ({ meta: [{ title: "Tratar fotos" }] }),
  component: BatchesList,
});

type Batch = {
  id: string;
  name: string;
  mode: string;
  status: string;
  image_count: number;
  created_at: string;
  enhanced_count?: number;
};

function BatchesList() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("photo_batches")
      .select("id,name,mode,status,image_count,created_at")
      .order("created_at", { ascending: false });
    const list = (data as Batch[]) ?? [];
    if (list.length > 0) {
      const ids = list.map((b) => b.id);
      const { data: imgs } = await supabase
        .from("photo_batch_images")
        .select("batch_id,enhanced_storage_path")
        .in("batch_id", ids);
      const counts: Record<string, number> = {};
      for (const im of (imgs as { batch_id: string; enhanced_storage_path: string | null }[]) ?? []) {
        if (im.enhanced_storage_path) counts[im.batch_id] = (counts[im.batch_id] ?? 0) + 1;
      }
      for (const b of list) b.enhanced_count = counts[b.id] ?? 0;
    }
    setBatches(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Excluir este lote e todas as fotos?")) return;
    try {
      await deleteBatch(id);
      toast.success("Lote excluído");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tratar fotos</h1>
          <p className="text-sm text-muted-foreground">Envie fotos avulsas para a IA tratar ou remover marca d'água.</p>
        </div>
        <Button asChild>
          <Link to="/tools/enhance/new"><Plus className="mr-2 h-4 w-4" /> Novo lote</Link>
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Meus lotes</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lote ainda. Clique em "Novo lote" para começar.</p>
          ) : (
            <ul className="divide-y">
              {batches.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex-1">
                    <Link to="/tools/enhance/$id" params={{ id: b.id }} className="font-medium hover:underline">
                      {b.name}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{b.mode === "watermark_only" ? "Marca d'água" : "Tratar completo"}</Badge>
                      <span>{b.image_count} foto(s)</span>
                      {b.enhanced_count ? (
                        <Badge
                          className={
                            b.enhanced_count === b.image_count
                              ? "bg-emerald-600 text-white hover:bg-emerald-600"
                              : "bg-fuchsia-600 text-white hover:bg-fuchsia-600"
                          }
                        >
                          IA {b.enhanced_count}/{b.image_count}
                        </Badge>
                      ) : null}
                      <span>· {formatDate(b.created_at)}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(b.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
