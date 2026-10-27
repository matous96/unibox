import { Check, ChevronDown, Languages, PenLine } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GITHUB_URL } from "@/config";
import { useDismiss } from "@/hooks/useDismiss";
import { LANGUAGES } from "@/i18n";
import { cn } from "@/lib/utils";
import { useSettings } from "@/store/settings";

/**
 * Přepínač jazyka v horní liště. Ukazuje kód aktuálního jazyka (CS / EN),
 * po kliknutí nabídku jazyků v jejich vlastním názvu.
 */
export function LanguageSwitcher() {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const setLanguage = useSettings((s) => s.setLanguage);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useDismiss(root, open, () => setOpen(false));

  const current = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={t("community.language", { language: current.label })}
        title={t("community.language", { language: current.label })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-8 cursor-pointer items-center gap-1 rounded-full px-2 text-xs font-semibold transition-colors",
          open ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
        )}
      >
        <Languages className="size-[18px]" />
        <span className="uppercase">{current.code}</span>
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 z-30 mt-2 w-56 origin-top-right rounded-2xl border border-line bg-surface p-1.5 shadow-card-hover"
          >
            {LANGUAGES.map((l) => {
              const active = l.code === current.code;
              return (
                <button
                  key={l.code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  lang={l.code}
                  onClick={() => {
                    setLanguage(l.code);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2",
                    active && "font-semibold text-accent",
                  )}
                >
                  <span className="w-6 text-xs font-semibold text-muted uppercase">{l.code}</span>
                  <span className="flex-1">{l.label}</span>
                  {active && <Check className="size-4" />}
                </button>
              );
            })}

            {/* Další jazyky – výzva k pomoci s překladem */}
            <div className="mx-2 my-1.5 h-px bg-line" />
            <a
              href={`${GITHUB_URL}/tree/main/src/i18n/locales`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <PenLine className="size-4 shrink-0" />
              {t("community.translate")}
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
