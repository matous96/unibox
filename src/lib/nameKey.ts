import { normalize } from "@/lib/utils";

const NAME_NOISE = new Set(["version", "verze", "x64", "x86", "arm64", "64-bit", "32-bit", "64bit", "32bit"]);

/**
 * Název pro spárování nainstalovaného programu s katalogem (stejné pravidlo
 * jako `arp::name_key` v Rustu): bez závorek, verzí a architektury.
 * „Ollama version 0.40.2“ = „Ollama“, „Mozilla Thunderbird (cs)“ = „Mozilla Thunderbird“.
 */
export const installedNameKey = (name: string) =>
  normalize(name)
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/)
    .filter((word) => word && !NAME_NOISE.has(word) && !/^v?\d+(\.\d+)+$/.test(word))
    .join("")
    .replace(/[^\p{L}\p{N}]+/gu, "");
