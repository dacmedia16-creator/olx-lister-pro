import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

export type EnhanceQuality = "low" | "medium";

export const QUALITY_COST_USD: Record<EnhanceQuality, number> = {
  low: 0.02,
  medium: 0.07,
};

export function QualityPicker({
  value,
  onChange,
  disabled,
}: {
  value: EnhanceQuality;
  onChange: (v: EnhanceQuality) => void;
  disabled?: boolean;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as EnhanceQuality)}
      disabled={disabled}
      className="gap-2"
    >
      <div className="flex items-start gap-2 rounded-md border p-3">
        <RadioGroupItem value="low" id="q-low" className="mt-1" />
        <Label htmlFor="q-low" className="flex-1 cursor-pointer font-normal">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Baixa</span>
            <span className="text-xs text-muted-foreground">~US$ 0,02/foto</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Rápida e econômica. Pode deformar linhas retas e móveis.
          </div>
        </Label>
      </div>
      <div className="flex items-start gap-2 rounded-md border p-3">
        <RadioGroupItem value="medium" id="q-med" className="mt-1" />
        <Label htmlFor="q-med" className="flex-1 cursor-pointer font-normal">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Média</span>
            <span className="text-xs text-muted-foreground">~US$ 0,07/foto</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Geometria preservada, linhas retas mantidas. ~3,5× mais cara.
          </div>
        </Label>
      </div>
    </RadioGroup>
  );
}
