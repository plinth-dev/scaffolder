import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGzip } from "node:zlib";
import { create as tarCreate } from "tar";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { scaffold } from "./scaffold.js";

interface Fixture {
  files: Record<string, string>;
}

let server: Server;
let baseUrl: string;
const FIXTURES = new Map<string, Fixture>();

async function buildTarball(repo: string, ref: string): Promise<Buffer> {
  const fixture = FIXTURES.get(`${repo}@${ref}`);
  if (!fixture) throw new Error(`no fixture for ${repo}@${ref}`);
  const stagingRoot = await mkdtemp(join(tmpdir(), "plinth-scaffold-fixt-"));
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
    files: {
      "go.mod": "module github.com/plinth-dev/starter-api\n",
      "cmd/server/main.go": "package main\n// starter-api\n",
    },
  });
  FIXTURES.set("starter-web@v0.1.0", {
    files: {
      "package.json": `{"name":"starter-web"}`,
      "instrumentation-client.ts": `serviceName: "starter-web"`,
    },
  });

  server = createServer((req, res) => {
    const m = (req.url ?? "").match(
      /^\/plinth-dev\/([^/]+)\/tar\.gz\/refs\/tags\/([^/]+)$/,
    );
    if (!m) return res.writeHead(404).end();
    const [, repo, ref] = m;
    if (!FIXTURES.has(`${repo}@${ref}`)) return res.writeHead(404).end();
    buildTarball(repo!, ref!).then((buf) => {
      res.writeHead(200, { "content-type": "application/gzip" });
      res.end(buf);
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const addr = server.address();
  if (typeof addr === "string" || addr === null) throw new Error();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("scaffold", () => {
  it("produces both scaffolds with rewritten identifiers", async () => {
    const ws = await mkdtemp(join(tmpdir(), "plinth-scaffold-"));
    const result = await scaffold({
      name: "billing",
      workspace: ws,
      modulePath: "github.com/acme/billing-api",
      baseUrl,
    });

    expect(result.apiPath).toBe(join(ws, "billing-api"));
    expect(result.webPath).toBe(join(ws, "billing-web"));
    expect(result.rewrittenFiles).toBeGreaterThan(0);

    const apiGoMod = (
      await readFile(join(ws, "billing-api/go.mod"))
    ).toString();
    expect(apiGoMod).toContain("module github.com/acme/billing-api");

    const apiMain = (
      await readFile(join(ws, "billing-api/cmd/server/main.go"))
    ).toString();
    expect(apiMain).toContain("// billing-api");

    const webPkg = (
      await readFile(join(ws, "billing-web/package.json"))
    ).toString();
    expect(webPkg).toContain(`"name":"billing-web"`);
  });

  it("only api when web=false", async () => {
    const ws = await mkdtemp(join(tmpdir(), "plinth-scaffold-"));
    const result = await scaffold({
      name: "acme",
      workspace: ws,
      web: false,
      modulePath: "github.com/acme/acme-api",
      baseUrl,
    });
    expect(result.apiPath).toBeDefined();
    expect(result.webPath).toBeUndefined();
  });

  it("rejects invalid names", async () => {
    const ws = await mkdtemp(join(tmpdir(), "plinth-scaffold-"));
    await expect(
      scaffold({ name: "Bad_Name", workspace: ws, baseUrl }),
    ).rejects.toThrow(/invalid name/);
  });

  it("rejects relative workspace path", async () => {
    await expect(
      scaffold({ name: "billing", workspace: "./relative", baseUrl }),
    ).rejects.toThrow(/absolute/);
  });

  it("rejects when neither api nor web is requested", async () => {
    const ws = await mkdtemp(join(tmpdir(), "plinth-scaffold-"));
    await expect(
      scaffold({
        name: "billing",
        workspace: ws,
        api: false,
        web: false,
        baseUrl,
      }),
    ).rejects.toThrow(/at least one/);
  });

  it("uses the default ref when omitted", async () => {
    const ws = await mkdtemp(join(tmpdir(), "plinth-scaffold-"));
    // Default ref is v0.1.0, which is the only fixture we have — it should
    // succeed without needing a ref override.
    await expect(
      scaffold({
        name: "ok",
        workspace: ws,
        web: false,
        modulePath: "github.com/acme/ok-api",
        baseUrl,
      }),
    ).resolves.toBeDefined();
  });
});
