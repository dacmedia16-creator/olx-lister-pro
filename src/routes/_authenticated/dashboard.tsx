import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate, JOB_STATUS_LABEL } from "@/lib/olx";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — OLX Importer" }] }),
  component: Dashboard,
});

type Stats = { listings: number; images: number; olx: number; zap: number };
type Listing = { id: string; title: string | null; price: number | null; city: string | null; created_at: string; source_portal: string | null };
type LogRow = { id: string; message: string | null; created_at: string; status: string };

function Dashboard() {
  const [stats, setStats] = useState<Stats>({ listings: 0, images: 0, olx: 0, zap: 0 });
  const [recent, setRecent] = useState<Listing[]>([]);
  const [errors, setErrors] = useState<LogRow[]>([]);

  useEffect(() => {
    (async () => {
      const [{ count: lc }, { count: ic }, { count: olxC }, { count: zapC }, { data: r }, { data: er }] = await Promise.all([
        supabase.from("olx_listings").select("id", { count: "exact", head: true }),
        supabase.from("listing_images").select("id", { count: "exact", head: true }).eq("status", "downloaded"),
        supabase.from("olx_listings").select("id", { count: "exact", head: true }).eq("source_portal", "olx"),
        supabase.from("olx_listings").select("id", { count: "exact", head: true }).eq("source_portal", "zap"),
        supabase.from("olx_listings").select("id,title,price,city,created_at,source_portal").order("created_at", { ascending: false }).limit(5),
        supabase.from("processing_logs").select("id,message,created_at,status").eq("status", "error").order("created_at", { ascending: false }).limit(5),
      ]);
      setStats({ listings: lc ?? 0, images: ic ?? 0, olx: olxC ?? 0, zap: zapC ?? 0 });
      setRecent((r as Listing[]) ?? []);
      setErrors((er as LogRow[]) ?? []);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Button asChild>
          <Link to="/import">Importar anúncios (OLX / ZAP)</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Total importados</CardTitle></CardHeader>
          <CardContent><div className="text-4xl font-semibold">{stats.listings}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">OLX</CardTitle></CardHeader>
          <CardContent><div className="text-4xl font-semibold">{stats.olx}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">ZAP Imóveis</CardTitle></CardHeader>
          <CardContent><div className="text-4xl font-semibold">{stats.zap}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Imagens baixadas</CardTitle></CardHeader>
          <CardContent><div className="text-4xl font-semibold">{stats.images}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Últimos anúncios</CardTitle></CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum anúncio ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((l) => (
                <li key={l.id} className="flex items-center justify-between py-2">
                  <Link to="/listings/$id" params={{ id: l.id }} className="flex-1 truncate text-sm hover:underline">
                    {l.title ?? "(sem título)"}
                  </Link>
                  <div className="ml-3 flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{l.city ?? "—"}</span>
                    <span>{formatBRL(l.price)}</span>
                    <span>{formatDate(l.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Últimos erros</CardTitle></CardHeader>
        <CardContent>
          {errors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem erros recentes.</p>
          ) : (
            <ul className="divide-y divide-border">
              {errors.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="truncate">{e.message ?? "(erro)"}</span>
                  <div className="ml-3 flex items-center gap-2 text-muted-foreground">
                    <Badge variant="destructive">{e.status}</Badge>
                    <span>{formatDate(e.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {JOB_STATUS_LABEL /* keep import used */ && null}
    </div>
  );
}
