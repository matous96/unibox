import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { TestBuildBadge } from "./TestBuildBadge";

/**
 * Vlastní titulková lišta desktopové aplikace (okno nemá systémové dekorace,
 * viz `decorations: false` v tauri.conf.json).
 *
 * - Prázdná plocha je zóna pro přetahování okna (`data-tauri-drag-region`),
 *   dvojklik okno maximalizuje / obnoví.
 * - Vpravo tlačítka minimalizace, maximalizace / obnovení a zavření ve stylu
 *   Windows 11 (glyfy systémového písma Segoe Fluent Icons).
 * - Zavření okna podle nastavení Unibox jen schová do oznamovací oblasti
 *   (řeší backend, tray.rs).
 * - Testovací verze (tauri dev) má nad logem v postranním panelu oranžový štítek,
 *   ať nejde zaměnit s nainstalovaným Uniboxem, který běží vedle.
 */
export function TitleBar() {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    const window = getCurrentWindow();
    const sync = () => void window.isMaximized().then(setMaximized);
    sync();
    const unlisten = [window.onResized(sync), window.onFocusChanged(({ payload }) => setFocused(payload))];
    return () => unlisten.forEach((promise) => void promise.then((stop) => stop()));
  }, []);

  const window = getCurrentWindow();

  return (
    <div data-tauri-drag-region className="flex h-8 shrink-0 select-none">
      {/* Nad postranním panelem stejné pozadí – panel tak opticky sahá až k hornímu okraji */}
      <div data-tauri-drag-region className="theme-transition flex w-64 shrink-0 items-end border-r border-line bg-sidebar px-5 pb-0.5">
        <TestBuildBadge />
      </div>
      <div data-tauri-drag-region className="flex min-w-0 flex-1 justify-end">
        <div className={cn("flex transition-opacity", !focused && "opacity-50")}>
          <CaptionButton label={t("titleBar.minimize")} onClick={() => void window.minimize()}>
            {""}
          </CaptionButton>
          <CaptionButton
            label={maximized ? t("titleBar.restore") : t("titleBar.maximize")}
            onClick={() => void window.toggleMaximize()}
          >
            {maximized ? "" : ""}
          </CaptionButton>
          <CaptionButton label={t("titleBar.close")} danger onClick={() => void window.close()}>
            {""}
          </CaptionButton>
        </div>
      </div>
    </div>
  );
}

/** Tlačítko titulkové lišty 46 × 32 px jako ve Windows 11. */
function CaptionButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-8 w-[46px] items-center justify-center text-[10px] text-fg/80 transition-colors",
        danger ? "hover:bg-[#c42b1c] hover:text-white active:bg-[#c42b1c]/80" : "hover:bg-fg/10 active:bg-fg/5",
      )}
      style={{ fontFamily: '"Segoe Fluent Icons", "Segoe MDL2 Assets"' }}
    >
      {children}
    </button>
  );
}
