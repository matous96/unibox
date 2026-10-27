import { CheckCircle2, Info, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useToasts, type ToastTone } from "@/store/toasts";

const icons: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const tones: Record<ToastTone, string> = {
  success: "text-success",
  error: "text-danger",
  info: "text-muted",
};

/** Notifikace v pravém dolním rohu. */
export function Toasts() {
  const { toasts, dismiss } = useToasts();

  return (
    <div className="pointer-events-none fixed right-6 bottom-6 z-40 flex w-80 flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = icons[toast.tone];
          return (
            <motion.button
              key={toast.id}
              type="button"
              layout
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              onClick={() => dismiss(toast.id)}
              className="pointer-events-auto flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 text-left text-sm shadow-card-hover backdrop-blur"
            >
              <Icon className={cn("size-5 shrink-0", tones[toast.tone])} />
              {/* Dlouhá chybová hláška nesmí přerůst okno – celá je v nápovědě a v centru oznámení */}
              <span className="line-clamp-4 min-w-0 flex-1 break-words" title={toast.message}>
                {toast.message}
              </span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
