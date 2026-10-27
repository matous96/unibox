import { Star } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Zobrazení hodnocení hvězdičkami, podporuje i částečné vyplnění (4,6). */
export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} aria-label={`${value.toFixed(1)} / 5`}>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.min(Math.max(value - i, 0), 1);
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star className="absolute inset-0 text-current opacity-25" style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

interface StarInputProps {
  value: number;
  onChange: (value: 1 | 2 | 3 | 4 | 5) => void;
  size?: number;
  label: (n: number) => string;
}

/** Interaktivní volba hodnocení (najetí myší zvýrazní, kliknutí potvrdí). */
export function StarInput({ value, onChange, size = 28, label }: StarInputProps) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <span className="inline-flex gap-1.5" onMouseLeave={() => setHover(0)}>
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <button
          key={n}
          type="button"
          aria-label={label(n)}
          title={label(n)}
          aria-pressed={value === n}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
          className="cursor-pointer text-accent transition-transform hover:scale-110 active:scale-95"
        >
          <Star
            style={{ width: size, height: size }}
            strokeWidth={1.75}
            fill={n <= shown ? "currentColor" : "none"}
          />
        </button>
      ))}
    </span>
  );
}
