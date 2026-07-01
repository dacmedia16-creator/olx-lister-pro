import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link to="/dashboard" className="text-lg font-semibold tracking-tight">
              OLX Importer
            </Link>
            <nav className="hidden gap-4 md:flex">
              <Link
                to="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-sm text-foreground font-medium" }}
              >
                Dashboard
              </Link>
              <Link
                to="/search"
                className="text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-sm text-foreground font-medium" }}
              >
                Buscar anúncios
              </Link>
              <Link
                to="/import"
                className="text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-sm text-foreground font-medium" }}
              >
                Importar por link
              </Link>
              <Link
                to="/listings"
                className="text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-sm text-foreground font-medium" }}
              >
                Anúncios importados
              </Link>
            </nav>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Sair
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
