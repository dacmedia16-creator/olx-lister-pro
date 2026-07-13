import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatBRL, formatDate } from "@/lib/olx";
import { detectPortal, PORTAL_LABEL, type Portal } from "@/lib/portals";
import { OlxImageCarousel } from "@/components/OlxImageCarousel";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({ meta: [{ title: "Buscar anúncios OLX" }] }),
  component: SearchPage,
});

type ResultRow = {
  id: string;
  source_url: string;
  title: string | null;
  price: number | null;
  price_display: string | null;
  main_image_url: string | null;
  image_urls: string[] | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  category: string | null;
  listed_at: string | null;
  image_count: number | null;
  imported_listing_id: string | null;
};

type SearchResponse = {
  search_id: string;
  results: ResultRow[];
  total: number;
  next_page: number | null;
  next_page_url: string | null;
  notFound?: boolean;
  error?: string;
};

function SearchPage() {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [total, setTotal] = useState(0);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [nextPageUrl, setNextPageUrl] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // filtros
  const [portal, setPortal] = useState<Portal>("olx");
  const [keyword, setKeyword] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [categoryPath, setCategoryPath] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [urlInput, setUrlInput] = useState("");

  async function runFilters(pageOverride?: number) {
    setLoading(true);
    setSelected({});
    const usePage = pageOverride ?? page;
    const body: Record<string, unknown> = { page: usePage, portal };
    if (keyword) body.keyword = keyword;
    if (state) body.state = state;
    if (city) body.city = city;
    if (region) body.region = region;
    if (neighborhood) body.neighborhood = neighborhood;
    if (categoryPath) body.categoryPath = categoryPath;
    if (priceMin) body.priceMin = Number(priceMin);
    if (priceMax) body.priceMax = Number(priceMax);
    if (sort) body.sort = sort;
    const { data, error } = await supabase.functions.invoke<SearchResponse>(
      "search-olx-listings",
      { body },
    );
    setLoading(false);
    handleResponse(data, error);
    if (pageOverride) setPage(pageOverride);
  }

  async function runByUrl() {
    if (!urlInput.trim()) return toast.error("Informe a URL");
    const detected = detectPortal(urlInput);
    if (detected === null) return toast.error("URL inválida (olx.com.br, zapimoveis.com.br ou vivareal.com.br)");
    if (detected !== portal) return toast.error(`A URL é de ${PORTAL_LABEL[detected]} — troque o portal selecionado.`);
    setLoading(true);
    setSelected({});
    const { data, error } = await supabase.functions.invoke<SearchResponse>(
      "search-olx-listings",
      { body: { url: urlInput.trim(), portal } },
    );
    setLoading(false);
    handleResponse(data, error);
  }

  function handleResponse(data: SearchResponse | null, error: unknown) {
    if (error) {
      const msg = (error as { message?: string })?.message ?? "Erro na busca";
      toast.error(msg);
      return;
    }
    if (!data) return;
    if (data.error) {
      toast.error(data.error);
      return;
    }
    setResults(data.results ?? []);
    setTotal(data.total ?? 0);
    setNextPage(data.next_page ?? null);
    setNextPageUrl(data.next_page_url ?? null);
    if (data.notFound || (data.results ?? []).length === 0) {
      toast.info("Nenhum anúncio encontrado");
    } else {
      toast.success(`${data.results.length} resultado(s)`);
    }
  }

  function toggleAll(checked: boolean) {
    const s: Record<string, boolean> = {};
    if (checked) for (const r of results) s[r.id] = true;
    setSelected(s);
  }

  async function importUrls(urls: string[]) {
    if (urls.length === 0) return toast.error("Selecione ao menos um anúncio");
    setImporting(true);
    const { data, error } = await supabase.functions.invoke("import-olx-listing", {
      body: { urls },
    });
    setImporting(false);
    if (error) return toast.error(error.message ?? "Erro ao importar");
    toast.success(`Importados: ${data?.successful ?? 0} · falhas: ${data?.failed ?? 0}`);
    // Recarrega para refletir imported_listing_id
    const ids = results.map((r) => r.id);
    if (ids.length) {
      const { data: fresh } = await supabase
        .from("olx_search_results")
        .select("id,imported_listing_id")
        .in("id", ids);
      if (fresh) {
        const map = new Map(fresh.map((r) => [r.id, r.imported_listing_id]));
        setResults((prev) =>
          prev.map((r) => ({ ...r, imported_listing_id: map.get(r.id) ?? r.imported_listing_id })),
        );
      }
    }
    setSelected({});
  }

  const selectedUrls = results.filter((r) => selected[r.id]).map((r) => r.source_url);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Buscar anúncios (OLX / ZAP / Viva Real)</h1>

      <Card>
        <CardHeader><CardTitle>Nova busca</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="filters">
            <TabsList>
              <TabsTrigger value="filters">Por filtros</TabsTrigger>
              <TabsTrigger value="url">Por URL de listagem</TabsTrigger>
            </TabsList>

            <TabsContent value="filters" className="pt-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>Portal</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={portal}
                    onChange={(e) => setPortal(e.target.value as Portal)}
                  >
                    <option value="olx">OLX</option>
                    <option value="zap">ZAP Imóveis</option>
                    <option value="viva">Viva Real</option>
                  </select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Palavra-chave</Label>
                  <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="apartamento" />
                </div>
                <div className="space-y-1">
                  <Label>Ordenação</Label>
                  <Input value={sort} onChange={(e) => setSort(e.target.value)} placeholder="date | price" />
                </div>
                <div className="space-y-1">
                  <Label>UF</Label>
                  <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="SP" />
                </div>
                <div className="space-y-1">
                  <Label>Cidade</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="São Paulo" />
                </div>
                <div className="space-y-1">
                  <Label>Bairro</Label>
                  <Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Moema" />
                </div>
                <div className="space-y-1">
                  <Label>Região</Label>
                  <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="São Paulo e região" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Categoria (path)</Label>
                  <Input value={categoryPath} onChange={(e) => setCategoryPath(e.target.value)} placeholder="imoveis" />
                </div>
                <div className="space-y-1">
                  <Label>Página</Label>
                  <Input type="number" min={1} value={page} onChange={(e) => setPage(Number(e.target.value) || 1)} />
                </div>
                <div className="space-y-1">
                  <Label>Preço mínimo</Label>
                  <Input type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Preço máximo</Label>
                  <Input type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
                </div>
              </div>
              <div className="pt-4">
                <Button onClick={() => runFilters()} disabled={loading}>
                  {loading ? "Buscando..." : "Buscar"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="url" className="pt-4">
              <div className="space-y-1">
                <Label>URL de listagem OLX</Label>
                <Input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://www.olx.com.br/imoveis/estado-sp"
                />
              </div>
              <div className="pt-4">
                <Button onClick={runByUrl} disabled={loading}>
                  {loading ? "Buscando..." : "Buscar por URL"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Resultados ({total})</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedUrls.length === results.length}
                    onCheckedChange={(v) => toggleAll(Boolean(v))}
                  />
                  Selecionar todos
                </label>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={importing || selectedUrls.length === 0}
                  onClick={() => importUrls(selectedUrls)}
                >
                  Importar selecionados ({selectedUrls.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={importing}
                  onClick={() => importUrls(results.map((r) => r.source_url))}
                >
                  Importar todos desta página
                </Button>
                {(nextPage || nextPageUrl) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={loading}
                    onClick={() => nextPageUrl ? (setUrlInput(nextPageUrl), runByUrl()) : runFilters(nextPage!)}
                  >
                    Próxima página
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {results.map((r) => (
                <div key={r.id} className="flex flex-col overflow-hidden rounded-md border border-border bg-card">
                  <div className="relative">
                    <OlxImageCarousel
                      urls={(r.image_urls && r.image_urls.length > 0) ? r.image_urls : (r.main_image_url ? [r.main_image_url] : [])}
                      alt={r.title ?? ""}
                    />
                    <label className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded bg-background/80 px-2 py-1 text-xs">
                      <Checkbox
                        checked={!!selected[r.id]}
                        onCheckedChange={(v) => setSelected((s) => ({ ...s, [r.id]: Boolean(v) }))}
                      />
                      Selecionar
                    </label>
                    {r.imported_listing_id && (
                      <Badge className="absolute right-2 top-2 z-10" variant="default">Importado</Badge>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <div className="line-clamp-2 text-sm font-medium">{r.title ?? "(sem título)"}</div>
                    <div className="text-sm font-semibold">
                      {r.price != null ? formatBRL(r.price) : r.price_display ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[r.neighborhood, r.city, r.state].filter(Boolean).join(" · ") || "—"}
                    </div>
                    <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                      <span>{r.category ?? "—"}</span>
                      <span>{formatDate(r.listed_at)}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                      <span>{r.image_count != null ? `${r.image_count} foto(s)` : ""}</span>
                      {r.source_url && (
                        <a href={r.source_url} target="_blank" rel="noreferrer" className="underline">
                          Abrir na OLX
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
