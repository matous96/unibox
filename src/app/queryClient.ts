import { QueryClient } from "@tanstack/react-query";

/** Sdílený klient TanStack Query (cache dat z katalogu a od správců balíčků). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/** Klíče dotazů na jednom místě, ať se nepletou. */
export const queryKeys = {
  catalog: ["catalog"] as const,
  installed: ["installed"] as const,
  managerStatus: (source: string) => ["manager-status", source] as const,
  search: (q: string) => ["search", q] as const,
  versions: (source: string, packageId: string) => ["versions", source, packageId] as const,
  ratingSummary: (id: string) => ["rating-summary", id] as const,
  /** Souhrny hodnocení všech aplikací (karty). */
  ratingSummaries: ["rating-summaries"] as const,
  reviews: (id: string) => ["reviews", id] as const,
  /** Vlastní hodnocení – podle uživatele, po přihlášení / odhlášení se načte znovu. */
  myReview: (id: string, userId?: string | null) => ["my-review", id, userId ?? null] as const,
  githubStars: (repo: string) => ["github-stars", repo] as const,
  /** Aplikace po spuštění Windows (stránka Po spuštění). */
  startup: ["startup"] as const,
  /** Zaznamenané instalace (sledování instalace). */
  installTraces: ["install-traces"] as const,
};
