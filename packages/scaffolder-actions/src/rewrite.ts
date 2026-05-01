import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Replacement is an ordered string substitution applied to file bodies.
 *
 * Order matters: longer / more specific tokens MUST come before shorter ones
 * they share a prefix with. For example, the full Go module path
 * `github.com/plinth-dev/starter-api` must run before the bare service-name
 * token `starter-api` so the latter does not corrupt the former.
 */
export interface Replacement {
  old: string;
  new: string;
}

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "vendor",
  "coverage",
  ".turbo",
  ".pnpm-store",
]);

const SKIP_FILES = new Set([
  "go.sum",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
]);

const SKIP_EXTS = new Set([
  ".tsbuildinfo",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".svg",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".zip",
  ".gz",
  ".tgz",
  ".tar",
  ".bz2",
  ".xz",
  ".7z",
  ".pdf",
  ".mp3",
  ".mp4",
  ".mov",
  ".webm",
  ".wasm",
]);

/**
 * Walk `root` and rewrite every text-file body using `replacements`. Binary
 * files, dependency directories, and lockfiles are skipped per the policy
 * above. The function returns the count of files that were actually changed
 * — useful for action logging.
 */
export async function applyReplacements(
  root: string,
  replacements: readonly Replacement[],
): Promise<number> {
  if (replacements.length === 0) return 0;
  let changed = 0;
  for await (const path of walk(root)) {
    if (await rewriteFile(path, replacements)) {
      changed += 1;
    }
  }
  return changed;
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(full);
      continue;
    }
    if (!e.isFile()) continue;
    if (SKIP_FILES.has(e.name)) continue;
    const dotIdx = e.name.lastIndexOf(".");
    if (dotIdx >= 0 && SKIP_EXTS.has(e.name.slice(dotIdx))) continue;
    yield full;
  }
}

async function rewriteFile(
  path: string,
  replacements: readonly Replacement[],
): Promise<boolean> {
  const body = await readFile(path);
  if (looksBinary(body)) return false;

  let updated = body.toString("utf8");
  const original = updated;
  for (const r of replacements) {
    if (!r.old || r.old === r.new) continue;
    if (!updated.includes(r.old)) continue;
    updated = updated.split(r.old).join(r.new);
  }
  if (updated === original) return false;

  const info = await stat(path);
  await writeFile(path, updated, { mode: info.mode });
  return true;
}

/**
 * Heuristic — same one git uses for diff/grep: any NUL byte in the first 8 KiB
 * marks the content as binary.
 */
function looksBinary(body: Buffer): boolean {
  const slice = body.subarray(0, 8 * 1024);
  for (let i = 0; i < slice.length; i++) {
    if (slice[i] === 0) return true;
  }
  return false;
}

/**
 * Replacement set for the starter-api scaffold.
 *
 * @param modulePath full Go module path (e.g. `github.com/acme/billing-api`)
 * @param serviceName bare service identifier baked into log lines, OTel
 *   operation names, and docker-compose (e.g. `billing-api`)
 */
export function forApi(modulePath: string, serviceName: string): Replacement[] {
  return [
    { old: "github.com/plinth-dev/starter-api", new: modulePath },
    { old: "starter-api", new: serviceName },
  ];
}

/**
 * Replacement set for the starter-web scaffold.
 *
 * @param packageName npm package name and service identifier
 *   (e.g. `billing-web`)
 */
export function forWeb(packageName: string): Replacement[] {
  return [{ old: "starter-web", new: packageName }];
}
