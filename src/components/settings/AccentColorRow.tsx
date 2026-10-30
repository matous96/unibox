/**
 * Barva zvýraznění (Nastavení → Vzhled): přednastavené palety a vlastní
 * barva přes výběr barvy / HEX kód. Uplatňuje ji useTheme (proměnná --accent),
 * takže se tlačítka, odznaky a aktivní stavy přebarví hned.
 */
import { Check, Pipette } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useSettings } from "@/store/settings";
import { Row } from "./SettingsUi";

/** Přednastavené barvy; null = výchozí modrá HubGetu. */
const PRESETS: { id: string; color: string | null }[] = [
  { id: "default", color: null },
  { id: "purple", color: "#7c3aed" },
  { id: "blue", color: "#2563eb" },
  { id: "teal", color: "#0d9488" },
  { id: "green", color: "#16a34a" },
  { id: "orange", color: "#ea580c" },
  { id: "pink", color: "#db2777" },
  { id: "red", color: "#dc2626" },
];

/** Výchozí modrá – kvůli náhledu ve výběru barvy. */
const DEFAULT_ACCENT = "#4f6bff";

export function AccentColorRow() {
  const { t } = useTranslation();
  const accent = useSettings((s) => s.accentColor);
  const setAccent = useSettings((s) => s.setAccentColor);
  const custom = accent && !PRESETS.some((p) => p.color === accent);

  return (
    <Row label={t("accent.label")} hint={t("accent.hint")}>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {PRESETS.map((preset) => {
          const active = preset.color === accent;
          const shown = preset.color ?? DEFAULT_ACCENT;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => setAccent(preset.color)}
              aria-pressed={active}
              aria-label={t(`accent.${preset.id}`)}
              title={t(`accent.${preset.id}`)}
              className={cn(
                "flex size-7 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110",
                active && "ring-2 ring-fg/60",
              )}
              style={{ background: shown }}
            >
              {active && <Check className="size-3.5 text-white drop-shadow" strokeWidth={3} />}
            </button>
          );
        })}
        {/* Vlastní barva: systémový výběr barvy, HEX kód se zobrazí vedle */}
        <label
          title={t("accent.custom")}
          className={cn(
            "relative flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-line px-2 text-xs font-medium text-muted transition-colors hover:text-fg",
            custom && "border-transparent ring-2 ring-fg/60 ring-offset-2 ring-offset-surface",
          )}
        >
          <span className="size-4 rounded-full" style={{ background: custom ? accent : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }} />
          {custom ? accent.toUpperCase() : <Pipette className="size-3.5" />}
          <input
            type="color"
            value={accent ?? DEFAULT_ACCENT}
            onChange={(e) => setAccent(e.target.value)}
            aria-label={t("accent.custom")}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
    </Row>
  );
}
