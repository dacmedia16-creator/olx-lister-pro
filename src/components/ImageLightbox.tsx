import { useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";

type Props = {
  images: string[];
  index: number | null;
  onClose: () => void;
  onChangeIndex: (next: number) => void;
};

export function ImageLightbox({ images, index, onClose, onChangeIndex }: Props) {
  const open = index !== null && index >= 0 && index < images.length;

  const go = useCallback(
    (delta: number) => {
      if (index === null || images.length === 0) return;
      const next = (index + delta + images.length) % images.length;
      onChangeIndex(next);
    },
    [index, images.length, onChangeIndex],
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, go, onClose]);

  if (!open) return null;
  const url = images[index!];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded bg-black/60 px-2 py-1 text-xs text-white">
        {index! + 1} / {images.length}
      </div>
      <button
        type="button"
        aria-label="Fechar"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
      >
        <X className="h-5 w-5" />
      </button>
      <a
        href={url}
        download
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label="Baixar foto"
        className="absolute right-14 top-3 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
      >
        <Download className="h-5 w-5" />
      </a>
      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Anterior"
            onClick={(e) => { e.stopPropagation(); go(-1); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="Próxima"
            onClick={(e) => { e.stopPropagation(); go(1); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[95vh] max-w-[95vw] object-contain"
      />
    </div>
  );
}
