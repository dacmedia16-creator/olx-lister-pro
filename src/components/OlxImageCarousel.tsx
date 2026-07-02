import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  urls: string[];
  alt?: string;
  className?: string;
  aspect?: string; // ex.: "aspect-video" | "aspect-square"
  showBullets?: boolean;
  onImageClick?: (index: number) => void;
};

export function OlxImageCarousel({ urls, alt = "", className, aspect = "aspect-video", showBullets = true, onImageClick }: Props) {

  const clean = useMemo(() => Array.from(new Set((urls ?? []).filter((u): u is string => typeof u === "string" && !!u))), [urls]);
  const [dead, setDead] = useState<Set<number>>(new Set());
  const [idx, setIdx] = useState(0);

  const alive = clean.map((_, i) => i).filter((i) => !dead.has(i));
  const currentIdx = alive.includes(idx) ? idx : (alive[0] ?? -1);
  const currentUrl = currentIdx >= 0 ? clean[currentIdx] : null;

  function step(delta: number) {
    if (alive.length === 0) return;
    const pos = alive.indexOf(currentIdx);
    const next = alive[(pos + delta + alive.length) % alive.length];
    setIdx(next);
  }

  function markDeadAndAdvance(i: number) {
    setDead((prev) => {
      const n = new Set(prev); n.add(i); return n;
    });
    // avança para próximo vivo
    const remaining = clean.map((_, k) => k).filter((k) => k !== i && !dead.has(k));
    if (remaining.length > 0) {
      const pos = remaining.findIndex((k) => k > i);
      setIdx(pos >= 0 ? remaining[pos] : remaining[0]);
    }
  }

  if (!currentUrl) {
    return (
      <div className={cn("relative flex items-center justify-center overflow-hidden bg-muted", aspect, className)}>
        <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
          <ImageOff className="h-5 w-5" />
          sem foto
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden bg-muted", aspect, className)}>
      <img
        key={currentUrl}
        src={currentUrl}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onClick={onImageClick ? () => onImageClick(currentIdx) : undefined}
        className={cn("h-full w-full object-cover", onImageClick && "cursor-zoom-in")}
        onError={() => markDeadAndAdvance(currentIdx)}
      />

      {alive.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Anterior"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); step(-1); }}
            className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1 text-foreground shadow-sm hover:bg-background"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Próxima"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); step(1); }}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1 text-foreground shadow-sm hover:bg-background"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {showBullets && (
            <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center gap-1">
              {alive.map((k) => (
                <span
                  key={k}
                  className={cn("h-1.5 w-1.5 rounded-full bg-background/60", k === currentIdx && "bg-background")}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
