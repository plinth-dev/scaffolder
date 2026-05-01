import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createGzip } from "node:zlib";
import { create as tarCreate } from "tar";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fetchAndExtract } from "./fetch.js";

interface Fixture {
  repo: string;
  ref: string;
  files: Record<string, string>;
}

let server: Server;
let baseUrl: string;
const FIXTURES = new Map<string, Fixture>();

async function buildTarball(repo: string, ref: string): Promise<Buffer> {
  const fixture = FIXTURES.get(`${repo}@${ref}`);
  if (!fixture) throw new Error(`no fixture for ${repo}@${ref}`);

  const stagingRoot = await mkdtemp(join(tmpdir(), "plinth-fixture-"));
  const prefix = `${repo}-${ref.replace(/^v/, "")}`;
  const stagingPrefix = join(stagingRoot, prefix);
  mkdirSync(stagingPrefix, { recursive: true });
  for (const [rel, body] of Object.entries(fixture.files)) {
    const full = join(stagingPrefix, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    tarCreate({ cwd: stagingRoot, gzip: false }, [prefix])
      .pipe(createGzip())
      .on("data", (c: Buffer) => chunks.push(c))
      .on("end", () => resolve())
      .on("error", (e) => reject(e));
  });
  return Buffer.concat(chunks);
}

beforeAll(async () => {
  FIXTURES.set("starter-api@v0.1.0", {
    repo: "starter-api",
    ref: "v0.1.0",
    files: {
      "go.mod": "module github.com/plinth-dev/starter-api\n\ngo 1.25.0\n",
      "cmd/server/main.go": "package main\n",
      "README.md": "# starter-api\n",
    },
  });

  server = createServer((req, res) => {
    // /plinth-dev/<repo>/tar.gz/refs/tags/<ref>
    const url = req.url ?? "";
    const match = url.match(
      /^\/plinth-dev\/([^/]+)\/tar\.gz\/refs\/tags\/([^/]+)$/,
    );
    if (!match) {
      res.writeHead(404).end();
      return;
    }
    const [, repo, ref] = match;
    const key = `${repo}@${ref}`;
    if (!FIXTURES.has(key)) {
      res.writeHead(404).end();
      return;
    }
    buildTarball(repo!, ref!).then((buf) => {
      res.writeHead(200, { "content-type": "application/gzip" });
      res.end(buf);
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (typeof addr === "string" || addr === null) throw new Error("no address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe("fetchAndExtract", () => {
  it("downloads + strips the leading <repo>-<ref>/ component", async () => {
    const dst = await mkdtemp(join(tmpdir(), "plinth-extract-"));
    await fetchAndExtract("plinth-dev", "starter-api", "v0.1.0", dst, {
      baseUrl,
    });

    const gomod = (await readFile(join(dst, "go.mod"))).toString("utf8");
    expect(gomod).toContain("module github.com/plinth-dev/starter-api");

    const main = (await readFile(join(dst, "cmd/server/main.go"))).toString(
      "utf8",
    );
    expect(main).toContain("package main");
  });

  it("rejects non-200", async () => {
    const dst = await mkdtemp(join(tmpdir(), "plinth-extract-"));
    await expect(
      fetchAndExtract("plinth-dev", "starter-api", "v9.9.9", dst, { baseUrl }),
    ).rejects.toThrow(/404/);
  });

  it("uses an injected fetch implementation when provided", async () => {
    const dst = await mkdtemp(join(tmpdir(), "plinth-extract-"));
    let calls = 0;
    const stubFetch: typeof fetch = async (url) => {
      calls += 1;
      // Re-route to the real test server.
      const real = await fetch(String(url));
      return real;
    };
    await fetchAndExtract("plinth-dev", "starter-api", "v0.1.0", dst, {
      baseUrl,
      fetchImpl: stubFetch,
    });
    expect(calls).toBe(1);
  });
});

// Touch unused import to keep linters quiet — Readable is used transitively.
void Readable;
