import { mkdir } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { extract as tarExtract } from "tar";

/**
 * GitHub serves a tarball of any tag at
 * https://codeload.github.com/<owner>/<repo>/tar.gz/refs/tags/<ref>
 * whose entries are prefixed with `<repo>-<ref-without-leading-v>/`.
 * `fetchAndExtract` strips that single leading path component.
 */
export const DEFAULT_BASE_URL = "https://codeload.github.com";

export interface FetchOptions {
  /** Override the codeload base URL (test-only). */
  baseUrl?: string;
  /** Custom fetch implementation (test-only). */
  fetchImpl?: typeof fetch;
}

/**
 * Download and extract <owner>/<repo>@<ref> into `dst`. `dst` is created if it
 * doesn't exist; existing files at the same paths are overwritten.
 */
export async function fetchAndExtract(
  owner: string,
  repo: string,
  ref: string,
  dst: string,
  opts: FetchOptions = {},
): Promise<void> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const url = `${baseUrl}/${owner}/${repo}/tar.gz/refs/tags/${ref}`;

  const resp = await fetchImpl(url);
  if (!resp.ok) {
    throw new Error(`fetch: GET ${url}: status ${resp.status}`);
  }
  if (!resp.body) {
    throw new Error(`fetch: GET ${url}: empty body`);
  }

  await mkdir(dst, { recursive: true });

  // Web ReadableStream → Node Readable → tar.extract
  const nodeStream = Readable.fromWeb(resp.body as never);
  await pipeline(nodeStream, tarExtract({ cwd: dst, strip: 1, gzip: true }));
}
