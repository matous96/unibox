/**
 * Stahování s mezipamětí na disku a ohledem na limity serverů:
 *  - odpovědi se ukládají do .cache/http (tělo + metadata),
 *  - platná uložená odpověď se znovu nestahuje (maxAge), jinak se ověří
 *    podmíněným požadavkem (ETag / Last-Modified → 304 Not Modified),
 *  - souběh požadavků omezuje fronta (Limiter) – zvlášť pro každý server,
 *  - při 429 / 5xx / výpadku sítě se požadavek opakuje s rostoucí pauzou
 *    (u 429 podle hlavičky Retry-After),
 *  - když server nedostupný a máme starší kopii, použije se ta (offline běh).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CACHE_DIR, USER_AGENT } from "../config.ts";
import { log } from "./log.ts";

/** Omezení počtu souběžných úloh (a volitelná pauza mezi nimi). */
export class Limiter {
  private active = 0;
  private waiting: (() => void)[] = [];
  private readonly max: number;
  private readonly delayMs: number;

  constructor(max: number, delayMs = 0) {
    this.max = max;
    this.delayMs = delayMs;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      if (this.delayMs) await sleep(this.delayMs);
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

export interface FetchOptions {
  /** Jak dlouho platí uložená odpověď bez ověření (ms); Infinity = neměnný obsah (adresa s hashem). */
  maxAge?: number;
  headers?: Record<string, string>;
  method?: "GET" | "HEAD";
  /** Fronta požadavků (omezení souběhu pro daný server). */
  limiter?: Limiter;
  /** Kolikrát zkusit znovu při 429 / 5xx / chybě sítě. */
  retries?: number;
}

interface CacheMeta {
  url: string;
  status: number;
  etag?: string | null;
  lastModified?: string | null;
  contentLength?: string | null;
  fetchedAt: number;
}

export const stats = { requests: 0, cacheHits: 0, notModified: 0, downloadedBytes: 0, retries: 0 };

const HTTP_DIR = join(CACHE_DIR, "http");
const defaultLimiter = new Limiter(8);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const keyOf = (url: string, method: string) => createHash("sha1").update(`${method} ${url}`).digest("hex");

async function readCache(key: string): Promise<{ meta: CacheMeta; body: Buffer } | null> {
  try {
    const meta = JSON.parse(await readFile(join(HTTP_DIR, `${key}.json`), "utf8")) as CacheMeta;
    const body = meta.status === 200 ? await readFile(join(HTTP_DIR, `${key}.bin`)).catch(() => Buffer.alloc(0)) : Buffer.alloc(0);
    return { meta, body };
  } catch {
    return null;
  }
}

async function writeCache(key: string, meta: CacheMeta, body: Buffer) {
  await mkdir(HTTP_DIR, { recursive: true });
  await writeFile(join(HTTP_DIR, `${key}.bin`), body);
  await writeFile(join(HTTP_DIR, `${key}.json`), JSON.stringify(meta));
}

export interface CachedResponse {
  status: number;
  body: Buffer;
  /** Hlavička Content-Length (u HEAD požadavků velikost souboru). */
  contentLength: number | null;
  fromCache: boolean;
}

/** Stáhne URL přes mezipaměť. Chybové stavy (404…) vrací, nevyhazuje. */
export async function cachedFetch(url: string, options: FetchOptions = {}): Promise<CachedResponse> {
  const method = options.method ?? "GET";
  const key = keyOf(url, method);
  const cached = await readCache(key);
  const maxAge = options.maxAge ?? 0;
  const toResult = (meta: CacheMeta, body: Buffer, fromCache: boolean): CachedResponse => ({
    status: meta.status,
    body,
    contentLength: meta.contentLength ? Number(meta.contentLength) : null,
    fromCache,
  });

  if (cached && Date.now() - cached.meta.fetchedAt < maxAge) {
    stats.cacheHits++;
    return toResult(cached.meta, cached.body, true);
  }

  const headers: Record<string, string> = { "User-Agent": USER_AGENT, ...options.headers };
  if (cached?.meta.status === 200) {
    if (cached.meta.etag) headers["If-None-Match"] = cached.meta.etag;
    if (cached.meta.lastModified) headers["If-Modified-Since"] = cached.meta.lastModified;
  }
  // GitHub API: s tokenem je limit 5000 požadavků za hodinu místo 60
  if (process.env.GITHUB_TOKEN && new URL(url).hostname === "api.github.com") {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const retries = options.retries ?? 5;
  const limiter = options.limiter ?? defaultLimiter;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await limiter.run(() => fetch(url, { method, headers, redirect: "follow", signal: AbortSignal.timeout(60_000) }));
      stats.requests++;

      if (res.status === 304 && cached) {
        stats.notModified++;
        const meta = { ...cached.meta, fetchedAt: Date.now() };
        await writeFile(join(HTTP_DIR, `${key}.json`), JSON.stringify(meta));
        return toResult(meta, cached.body, true);
      }

      // Přetížení serveru / limit požadavků – počkat a zkusit znovu
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt + Math.random() * 500;
        stats.retries++;
        log.warn(`${res.status} ${url} – další pokus za ${Math.round(wait / 1000)} s`);
        await sleep(wait);
        continue;
      }

      const body = method === "HEAD" ? Buffer.alloc(0) : Buffer.from(await res.arrayBuffer());
      stats.downloadedBytes += body.length;
      const meta: CacheMeta = {
        url,
        status: res.status,
        etag: res.headers.get("etag"),
        lastModified: res.headers.get("last-modified"),
        contentLength: res.headers.get("content-length"),
        fetchedAt: Date.now(),
      };
      // Ukládají se i 404, ať se chybějící soubory nestahují pořád dokola
      if (res.status === 200 || res.status === 404) await writeCache(key, meta, body);
      return toResult(meta, body, false);
    } catch (error) {
      if (attempt < retries) {
        stats.retries++;
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      // Offline: použít starší uloženou kopii, pokud je
      if (cached) {
        log.warn(`${url} nedostupné (${(error as Error).message}) – používám uloženou kopii`);
        return toResult(cached.meta, cached.body, true);
      }
      throw error;
    }
  }
}

/** Stáhne JSON (chybu vyhodí při jiném stavu než 200). */
export async function fetchJson<T>(url: string, options?: FetchOptions): Promise<T> {
  const res = await cachedFetch(url, options);
  if (res.status !== 200) throw new Error(`${res.status} ${url}`);
  return JSON.parse(res.body.toString("utf8")) as T;
}

/** Stáhne text (chybu vyhodí při jiném stavu než 200). */
export async function fetchText(url: string, options?: FetchOptions): Promise<string> {
  const res = await cachedFetch(url, options);
  if (res.status !== 200) throw new Error(`${res.status} ${url}`);
  return res.body.toString("utf8");
}

/** Spustí úlohy nad položkami s omezeným souběhem; chyba jedné úlohy ostatní nezastaví. */
export async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<(R | undefined)[]> {
  const limiter = new Limiter(limit);
  return Promise.all(
    items.map((item) =>
      limiter.run(async () => {
        try {
          return await task(item);
        } catch (error) {
          log.warn((error as Error).message);
          return undefined;
        }
      }),
    ),
  );
}
