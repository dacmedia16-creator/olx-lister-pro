import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { isValidOlxUrl, JOB_STATUS_LABEL, formatDate } from "@/lib/olx";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Importar OLX" }] }),
  component: ImportPage,
});

type Job = {
  id: string;
  status: keyof typeof JOB_STATUS_LABEL;
  total_urls: number;
  processed_urls: number;
  successful_count: number;
  failed_count: number;
  created_at: string;
};

function ImportPage() {
  const [singleUrl, setSingleUrl] = useState("");
  const [multiUrls, setMultiUrls] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);

  const loadJobs = useCallback(async () => {
    const { data } = await supabase
      .from("olx_import_jobs")
      .select("id,status,total_urls,processed_urls,successful_count,failed_count,created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    setJobs((data as Job[]) ?? []);
  }, []);

  useEffect(() => {
    loadJobs();
    const t = setInterval(loadJobs, 3000);
    return () => clearInterval(t);
  }, [loadJobs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const urls = [
      singleUrl.trim(),
      ...multiUrls.split(/\r?\n/).map((s) => s.trim()),
    ].filter(Boolean);
    if (urls.length === 0) return toast.error("Informe ao menos uma URL");
    const invalid = urls.filter((u) => !isValidOlxUrl(u));
    if (invalid.length > 0) {
      return toast.error(`URL inválida (apenas olx.com.br ou zapimoveis.com.br): ${invalid[0]}`);
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("import-olx-listing", {
      body: { urls },
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message ?? "Erro ao importar");
      return;
    }
    toast.success(
      `Importação: ${data?.successful ?? 0} ok, ${data?.failed ?? 0} falhas${data?.notFound ? `, ${data.notFound} não encontrados` : ""}`,
    );
    setSingleUrl("");
    setMultiUrls("");
    loadJobs();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Importar anúncios (OLX / ZAP Imóveis)</h1>
      <Card>
        <CardHeader><CardTitle>Novas URLs</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="single">URL individual</Label>
              <Input
                id="single"
                placeholder="https://www.olx.com.br/... ou https://www.zapimoveis.com.br/..."
                value={singleUrl}
                onChange={(e) => setSingleUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="multi">Várias URLs (uma por linha)</Label>
              <Textarea
                id="multi"
                rows={6}
                placeholder="https://www.olx.com.br/...&#10;https://www.zapimoveis.com.br/..."
                value={multiUrls}
                onChange={(e) => setMultiUrls(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Importando..." : "Importar"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Importações recentes</CardTitle></CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma importação ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {jobs.map((j) => (
                <li key={j.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <Badge variant={j.status === "completed" ? "default" : j.status === "failed" ? "destructive" : "secondary"}>
                      {JOB_STATUS_LABEL[j.status] ?? j.status}
                    </Badge>
                    <span className="text-muted-foreground">{formatDate(j.created_at)}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {j.processed_urls}/{j.total_urls} · ok {j.successful_count} · falha {j.failed_count}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
