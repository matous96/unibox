import { useEffect, useRef, type RefObject } from "react";

// Otevřené překryvy (dialogy, prohlížeč snímků, nabídky) v pořadí otevření. Klávesy dostane jen
// ten nejvrchnější – jedno Esc tak zavře jen horní dialog, ne i ten pod ním. Posluchače se volají
// v pořadí registrace, takže horní překryv (otevřený jako poslední) přijde na řadu až po spodních.
const stack: object[] = [];

/**
 * Je otevřený modální dialog? Globální zkratky stránky (Ctrl+Enter, Ctrl+K) se pod ním nespouštějí.
 * Rozbalovací nabídky se nepočítají – kontextová nabídka karty sama nabízí Ctrl+Enter.
 */
export const overlayOpen = () => document.querySelector("[aria-modal]") !== null;

// Prvek, ze kterého naposledy odešel fokus. Když si dialog fokus vezme sám (autoFocus tlačítka),
// stane se to dřív než efekt níže – prvek, který dialog otevřel, je pak právě tenhle.
let lastBlurred: Element | null = null;
document.addEventListener("focusin", (e) => (lastBlurred = e.relatedTarget as Element | null), true);

/**
 * Klávesy překryvu (Esc, šipky) jen pro ten nejvrchnější. S `focusRef` navíc přesune fokus do
 * překryvu (Tab ani Enter pak nepůsobí na stránku pod ním) a po zavření ho vrátí prvku, který
 * překryv otevřel.
 */
export function useOverlay(open: boolean, onKey: (e: KeyboardEvent) => void, focusRef?: RefObject<HTMLElement | null>) {
  const handler = useRef(onKey);
  useEffect(() => {
    handler.current = onKey;
  });

  useEffect(() => {
    if (!open) return;
    const token = {};
    stack.push(token);
    const listener = (e: KeyboardEvent) => {
      if (stack.at(-1) === token) handler.current(e);
    };
    window.addEventListener("keydown", listener);

    const element = focusRef?.current;
    const focusedInside = !!element?.contains(document.activeElement);
    const opener = focusedInside ? lastBlurred : document.activeElement;
    const previous = opener instanceof HTMLElement ? opener : null;
    // Prvek s autoFocus (pole v přihlášení) už fokus má – ten zůstane
    if (element && !focusedInside) element.focus({ preventScroll: true });

    return () => {
      window.removeEventListener("keydown", listener);
      stack.splice(stack.indexOf(token), 1);
      // Při zavření (i animovaném) je fokus ještě v překryvu, po kliku na pozadí na <body>
      const active = document.activeElement;
      if (element && (active === document.body || element.contains(active)) && previous?.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [open, focusRef]);
}
