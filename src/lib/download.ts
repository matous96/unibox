/**
 * Uložení textu do souboru: v desktopové aplikaci systémový dialog „Uložit
 * jako“ (src-tauri/src/files.rs), ve webové verzi stažení prohlížečem.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./tauri";

/** Názvy typů souborů pro filtr v dialogu (podle přípony). */
const FILE_TYPES: Record<string, string> = {
  ubundle: "HubGet",
  json: "JSON",
  ps1: "PowerShell",
  log: "Log",
};

/**
 * Uloží text do souboru. Vrátí cestu k uloženému souboru (desktop), prázdný
 * řetězec u stažení prohlížečem, nebo null, když uživatel dialog zavřel.
 */
export async function saveTextFile(filename: string, content: string, mime = "text/plain"): Promise<string | null> {
  if (isTauri()) {
    const extension = filename.split(".").pop()?.toLowerCase() ?? "";
    return invoke<string | null>("save_text_file", {
      fileName: filename,
      content,
      filterName: FILE_TYPES[extension] ?? extension.toUpperCase(),
      extensions: extension ? [extension] : [],
    });
  }
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "";
}

/** Bezpečný název souboru z libovolného textu. */
export const safeFileName = (name: string, fallback: string) =>
  (name.trim() || fallback).replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
