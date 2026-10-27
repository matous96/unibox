import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { IconButton } from "./Button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Obecné modální okno s nadpisem, obsahem a patičkou (Esc / klik mimo zavře). */
export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal
            className={cn(
              "flex max-h-full w-full flex-col rounded-2xl border border-line bg-surface shadow-card-hover",
              // Vlastní šířka (max-w-2xl…) nahradí výchozí – dvě třídy max-w by se přebíjely podle pořadí v CSS
              !className?.includes("max-w-") && "max-w-lg",
              className,
            )}
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-3">
              <h2 className="text-lg font-semibold">{title}</h2>
              <IconButton aria-label={t("common.close")} onClick={onClose}>
                <X className="size-5" />
              </IconButton>
            </div>
            <div className="min-h-0 overflow-y-auto px-6 pb-5">{children}</div>
            {/* Tlačítka, která se do šířky nevejdou, se zalomí na další řádek – nikdy nepřetečou z okna */}
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
