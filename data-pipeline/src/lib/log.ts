/** Jednoduchý výpis průběhu pipeline s časem od startu. */
const start = Date.now();

const elapsed = () => `${((Date.now() - start) / 1000).toFixed(1).padStart(6)} s`;

export const log = {
  step: (text: string) => console.log(`\n${elapsed()}  ▸ ${text}`),
  info: (text: string) => console.log(`${elapsed()}    ${text}`),
  warn: (text: string) => console.warn(`${elapsed()}  ! ${text}`),
};

/** Průběh dlouhé smyčky – vypíše se nejvýš každých pár sekund. */
export function progress(label: string, total: number) {
  let done = 0;
  let last = 0;
  return () => {
    done++;
    const now = Date.now();
    if (now - last > 3000 || done === total) {
      last = now;
      log.info(`${label}: ${done} / ${total}`);
    }
  };
}
