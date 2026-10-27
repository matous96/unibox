/**
 * Publikování aplikace do WinGetu (komunitní repozitář microsoft/winget-pkgs –
 * zdarma, open source; Unibox z něj bere katalog):
 *  - analýza instalátoru a `winget validate` (Rust, src-tauri/src/publish.rs),
 *  - odeslání pull requestu z GitHub účtu vývojáře: přihlášení OAuth device
 *    flow (bez hesla v aplikaci, oprávnění public_repo), fork winget-pkgs,
 *    větev s jedním commitem (3 soubory manifestu) a pull request. Token je jen
 *    v paměti po dobu průvodce.
 *
 * Přímé odeslání potřebuje client_id bezplatné aplikace GitHub OAuth Uniboxu
 * (VITE_GITHUB_CLIENT_ID, s povoleným Device Flow). Bez něj průvodce manifest
 * uloží a ukáže, jak ho odeslat ručně nebo nástrojem wingetcreate.
 */
import { invoke } from "@tauri-apps/api/core";
import { manifestPath, pullRequest, type ManifestData, type ManifestFile } from "@/lib/wingetManifest";

export const GITHUB_CLIENT_ID: string | undefined = import.meta.env.VITE_GITHUB_CLIENT_ID || undefined;

const UPSTREAM = "microsoft/winget-pkgs";
const API = "https://api.github.com";

export interface InstallerAnalysis {
  fileName: string;
  size: number;
  sha256: string;
  installerType: ManifestData["installer"]["type"];
  architecture: ManifestData["installer"]["architecture"];
  architectureSource: "url" | "binary" | "guess";
  productName: string | null;
  publisher: string | null;
  version: string | null;
  copyright: string | null;
  productCode: string | null;
}

export const analyzeInstaller = (url: string) => invoke<InstallerAnalysis>("publish_analyze_installer", { url });

export const validateManifestFiles = (files: ManifestFile[]) => invoke<{ ok: boolean; output: string }>("publish_validate_manifest", { files });

/** Uloží manifest do složky vybrané v dialogu (podsložka <id>/<verze>); null = dialog zavřen. */
export const saveManifestFiles = (data: ManifestData, files: ManifestFile[]) =>
  invoke<string | null>("publish_save_manifest", { subfolder: `${data.identifier.trim()}/${data.version.trim()}`, files });

// ── GitHub ───────────────────────────────────────────────────────────────

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}

export const startGitHubLogin = () => invoke<DeviceCode>("github_device_start", { clientId: GITHUB_CLIENT_ID });

/**
 * Počká, až uživatel přihlášení na GitHubu potvrdí (dotazuje se v intervalu,
 * který GitHub určil). Vrátí token, nebo vyhodí chybu (zamítnuto, vypršelo, zrušeno).
 */
export async function waitForGitHubToken(code: DeviceCode, signal: AbortSignal): Promise<string> {
  let interval = Math.max(code.interval, 5) * 1000;
  const deadline = Date.now() + code.expiresIn * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    if (signal.aborted) throw new DOMException("cancelled", "AbortError");
    const poll = await invoke<{ status: string; token: string | null }>("github_device_poll", { clientId: GITHUB_CLIENT_ID, deviceCode: code.deviceCode });
    if (poll.status === "token" && poll.token) return poll.token;
    if (poll.status === "slow_down") interval += 5000;
    else if (poll.status === "denied") throw new PublishError("denied");
    else if (poll.status === "expired") throw new PublishError("expired");
  }
  throw new PublishError("expired");
}

/** Chyba odeslání s klíčem textu (i18n publishWinget.submitError.*). */
export class PublishError extends Error {
  constructor(
    public readonly reason: "denied" | "expired" | "exists" | "fork" | "github",
    detail = "",
  ) {
    super(detail || reason);
  }
}

async function github<T>(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const data = (text ? JSON.parse(text) : null) as T;
  return { status: res.status, data };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type SubmitStep = "account" | "check" | "fork" | "commit" | "pullRequest";

/**
 * Odešle manifest jako pull request do microsoft/winget-pkgs z účtu přihlášeného
 * uživatele. Vrátí adresu pull requestu.
 */
export async function submitPullRequest(
  token: string,
  data: ManifestData,
  files: ManifestFile[],
  validated: boolean,
  onStep: (step: SubmitStep) => void,
): Promise<string> {
  const fail = (status: number, what: string): never => {
    throw new PublishError("github", `${what}: HTTP ${status}`);
  };

  onStep("account");
  const user = await github<{ login: string }>(token, "/user");
  if (user.status !== 200) fail(user.status, "účet");
  const login = user.data.login;

  // Tahle verze už ve WinGetu je? Jiná verze = aktualizace balíčku
  onStep("check");
  const folder = manifestPath(data);
  const existing = await github(token, `/repos/${UPSTREAM}/contents/${folder}`);
  if (existing.status === 200) throw new PublishError("exists");
  const packageFolder = folder.slice(0, folder.lastIndexOf("/"));
  const isUpdate = (await github(token, `/repos/${UPSTREAM}/contents/${packageFolder}`)).status === 200;

  // Fork winget-pkgs v účtu uživatele (vytvoří se jednou, pak se jen srovná s originálem)
  onStep("fork");
  const fork = `${login}/winget-pkgs`;
  if ((await github(token, `/repos/${fork}`)).status !== 200) {
    const created = await github(token, `/repos/${UPSTREAM}/forks`, { method: "POST", body: { default_branch_only: true } });
    if (created.status !== 202 && created.status !== 200) fail(created.status, "fork");
    let ready = false;
    for (let i = 0; i < 30 && !ready; i++) {
      await sleep(3000);
      ready = (await github(token, `/repos/${fork}/branches/master`)).status === 200;
    }
    if (!ready) throw new PublishError("fork");
  }
  await github(token, `/repos/${fork}/merge-upstream`, { method: "POST", body: { branch: "master" } });

  // Jeden commit se třemi soubory na nové větvi
  onStep("commit");
  const head = await github<{ object: { sha: string } }>(token, `/repos/${UPSTREAM}/git/ref/heads/master`);
  if (head.status !== 200) fail(head.status, "master");
  const base = head.data.object.sha;
  const tree = await github<{ sha: string }>(token, `/repos/${fork}/git/trees`, {
    method: "POST",
    body: { base_tree: base, tree: files.map((f) => ({ path: `${folder}/${f.name}`, mode: "100644", type: "blob", content: f.content })) },
  });
  if (tree.status !== 201) fail(tree.status, "strom souborů");
  const pr = pullRequest(data, isUpdate, validated);
  const commit = await github<{ sha: string }>(token, `/repos/${fork}/git/commits`, {
    method: "POST",
    body: { message: pr.title, tree: tree.data.sha, parents: [base] },
  });
  if (commit.status !== 201) fail(commit.status, "commit");
  const branch = `unibox-${data.identifier.trim()}-${data.version.trim()}-${Date.now().toString(36)}`.replace(/[^A-Za-z0-9._-]/g, "-");
  const ref = await github(token, `/repos/${fork}/git/refs`, { method: "POST", body: { ref: `refs/heads/${branch}`, sha: commit.data.sha } });
  if (ref.status !== 201) fail(ref.status, "větev");

  onStep("pullRequest");
  const created = await github<{ html_url: string }>(token, `/repos/${UPSTREAM}/pulls`, {
    method: "POST",
    body: { title: pr.title, head: `${login}:${branch}`, base: "master", body: pr.body },
  });
  if (created.status !== 201) fail(created.status, "pull request");
  return created.data.html_url;
}
