import { useId } from "react";
import { isTestBuild } from "@/lib/tauri";

interface HubGetLogoProps {
  /** Velikost v pixelech (logo je čtvercové). */
  size?: number;
  className?: string;
  /** Přístupný popis; bez něj je logo dekorativní. */
  title?: string;
}

/**
 * Logo HubGet – otevřená krabice, ze které vystupují tři „aplikace“
 * v barvách zdrojů (Chocolatey, winget, Scoop), na krabici tenký nápis „hubget“
 * (od 28 px). Stejné logo je v assets/unibox-logo.svg (zdroj pro ikony aplikace a web),
 * bez nápisu pro malé velikosti v assets/unibox-mark.svg a public/favicon.svg.
 * Testovací verze (tauri dev) má oranžový podklad a nápis „test“ – stejně jako ikona
 * okna a ikona u hodin (assets/unibox-test.svg), aby nešla zaměnit s nainstalovaným HubGetem.
 */
export function HubGetLogo({ size = 36, className, title }: HubGetLogoProps) {
  // Unikátní id gradientu, aby se nehádalo více log na jedné stránce
  const gradientId = useId();
  const test = isTestBuild();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <defs>
        {/* Jemné světlo shora – barva zůstává modrá akcentová (testovací verze oranžová) */}
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={test ? "#fb923c" : "#5b77ff"} />
          <stop offset="1" stopColor={test ? "#ea580c" : "#4560f5"} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${gradientId})`} />

      {/* Tři aplikace vystupující z krabice (Chocolatey, winget, Scoop) */}
      <rect x="19" y="17" width="10" height="10" rx="2.5" fill="#f59e0b" transform="rotate(-12 24 22)" />
      <rect x="27" y="10" width="10" height="10" rx="2.5" fill="#38bdf8" />
      <rect x="35" y="17" width="10" height="10" rx="2.5" fill="#10b981" transform="rotate(12 40 22)" />

      {/* Otevřené klopy a tělo krabice */}
      <path d="M15 31 H32 L27 24 H9 Z" fill="#fff" fillOpacity="0.7" />
      <path d="M32 31 H49 L55 24 H37 Z" fill="#fff" fillOpacity="0.7" />
      <rect x="15" y="31" width="34" height="21" rx="3" fill="#fff" />

      {/* Tenký nápis na krabici – v malém logu (pilíře na Domů) by byl jen šmouha */}
      {size >= 28 && test && (
        <text
          x="32"
          y="45.6"
          textAnchor="middle"
          fontFamily="'Segoe UI', Arial, sans-serif"
          fontSize="11"
          fontWeight="700"
          letterSpacing="-0.2"
          fill="#c2410c"
        >
          test
        </text>
      )}
      {size >= 28 && !test && (
        <text
          x="32"
          y="44.2"
          textAnchor="middle"
          fontSize="8"
          fontWeight="300"
          letterSpacing="0.2"
          fill="#4560f5"
        >
          hubget
        </text>
      )}
    </svg>
  );
}
