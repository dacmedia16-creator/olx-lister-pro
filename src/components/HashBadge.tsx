import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  hash: string;
  /** "nome" | "telefone" | genérico */
  kind?: "name" | "phone" | "generic";
};

function truncate(h: string) {
  if (h.length <= 20) return h;
  return `${h.slice(0, 8)}…${h.slice(-8)}`;
}

const COPY: Record<NonNullable<Props["kind"]>, string> = {
  name: "A GeckoAPI entrega o nome do vendedor apenas hasheado (SHA-256) por conformidade LGPD. Use este hash para identificar o mesmo vendedor entre anúncios.",
  phone: "A GeckoAPI entrega telefones apenas hasheados (SHA-256) por conformidade LGPD — não é possível recuperar o número. Para falar com o vendedor, abra o anúncio na OLX.",
  generic: "Dado hasheado (SHA-256) por conformidade LGPD.",
};

export function HashBadge({ hash, kind = "generic" }: Props) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-wrap items-center gap-2">
        <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">{truncate(hash)}</code>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="cursor-help gap-1">
              <ShieldCheck className="h-3 w-3" />
              Hash LGPD
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs leading-relaxed">
            {COPY[kind]}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
