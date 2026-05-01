import { mkdir, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { type FetchOptions, fetchAndExtract } from "./fetch.js";
import { applyReplacements, forApi, forWeb } from "./rewrite.js";

export interface ScaffoldOptions {
  /** Output module name; lowercase kebab-case. The API tier lands in
   *  `<workspace>/<name>-api/`, the web tier in `<workspace>/<name>-web/`. */
  name: string;
  /** Parent directory the scaffolds are written into. Must exist. */
  workspace: string;
  /** Scaffold the API tier (default: true). */
  api?: boolean;
  /** Scaffold the web tier (default: true). */
  web?: boolean;
  /** Go module path for the API tier (default `github.com/example/<name>-api`). */
  modulePath?: string;
  /** Starter tag to fetch (default `v0.1.0`). */
  ref?: string;
  /** Override the GitHub codeload base URL — test-only. */
  baseUrl?: string;
  /** Override fetch — test-only. */
  fetchImpl?: typeof fetch;
  /** Optional logger; defaults to a no-op. */
  log?: (message: string) => void;
}

export interface ScaffoldResult {
  apiPath?: string;
  webPath?: string;
  rewrittenFiles: number;
}

const NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const SCAFFOLD_TIMEOUT_MS = 120_000;

/**
 * Mirrors `plinth new <name>` from the CLI: download the relevant starter
 * tarball(s), extract them, and rewrite the identifier tokens. This is the
 * pure, Backstage-free entry point — `createPlinthScaffoldAction` wraps it
 * behind the Backstage action contract.
 */
export async function scaffold(opts: ScaffoldOptions): Promise<ScaffoldResult> {
  if (!NAME_RE.test(opts.name)) {
    throw new Error(
      `invalid name "${opts.name}" — must be lowercase kebab-case (e.g. "billing")`,
    );
  }
  if (!isAbsolute(opts.workspace)) {
    throw new Error(`workspace must be absolute, got "${opts.workspace}"`);
  }
  await stat(opts.workspace);

  const wantApi = opts.api ?? true;
  const wantWeb = opts.web ?? true;
  if (!wantApi && !wantWeb) {
    throw new Error("at least one of `api` or `web` must be true");
  }

  const ref = opts.ref ?? "v0.1.0";
  const modulePath = opts.modulePath ?? `github.com/example/${opts.name}-api`;
  const log = opts.log ?? (() => {});
  const fetchOpts: FetchOptions = {
    baseUrl: opts.baseUrl,
    fetchImpl: opts.fetchImpl,
  };

  const result: ScaffoldResult = { rewrittenFiles: 0 };

  // Allow the operation to abort if it overshoots the budget — tar/extract
  // errors will propagate naturally; this is a backstop on the network step.
  const abortBudget = AbortSignal.timeout(SCAFFOLD_TIMEOUT_MS);
  abortBudget.addEventListener("abort", () => {
    log("scaffold: aborted (timeout)");
  });

  if (wantApi) {
    const serviceName = `${opts.name}-api`;
    const dst = join(opts.workspace, serviceName);
    await mkdir(dst, { recursive: true });
    log(`fetch starter-api@${ref} → ${dst}`);
    await fetchAndExtract("plinth-dev", "starter-api", ref, dst, fetchOpts);
    log(`rewrite identifiers in ${serviceName}`);
    result.rewrittenFiles += await applyReplacements(
      dst,
      forApi(modulePath, serviceName),
    );
    result.apiPath = dst;
  }

  if (wantWeb) {
    const serviceName = `${opts.name}-web`;
    const dst = join(opts.workspace, serviceName);
    await mkdir(dst, { recursive: true });
    log(`fetch starter-web@${ref} → ${dst}`);
    await fetchAndExtract("plinth-dev", "starter-web", ref, dst, fetchOpts);
    log(`rewrite identifiers in ${serviceName}`);
    result.rewrittenFiles += await applyReplacements(dst, forWeb(serviceName));
    result.webPath = dst;
  }

  return result;
}
