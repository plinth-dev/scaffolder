import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { applyReplacements, forApi, forWeb } from "./rewrite.js";

let tempDirs: string[] = [];

afterEach(async () => {
  // Vitest cleans up its own tmpdir for each test run; we just track for diag.
  tempDirs = [];
});

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plinth-rewrite-"));
  tempDirs.push(root);
  return root;
}

async function writeFileAt(
  root: string,
  rel: string,
  body: string | Buffer,
): Promise<void> {
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, body);
}

async function readFileAt(root: string, rel: string): Promise<string> {
  return (await readFile(join(root, rel))).toString("utf8");
}

describe("applyReplacements (api)", () => {
  it("rewrites the full module path before the bare service-name token", async () => {
    const root = await makeTempRoot();
    await writeFileAt(
      root,
      "go.mod",
      `module github.com/plinth-dev/starter-api

go 1.25.0

require github.com/plinth-dev/sdk-go/audit v0.1.0
`,
    );
    await writeFileAt(
      root,
      "cmd/server/main.go",
      `package main

import (
	"github.com/plinth-dev/sdk-go/audit"
	"github.com/plinth-dev/starter-api/internal/handlers"
)

// starter-api entry point
var _ = handlers.X
var _ = audit.Event{}
`,
    );
    await writeFileAt(
      root,
      "docker-compose.yml",
      "services:\n  api:\n    environment:\n      SERVICE_NAME: starter-api\n",
    );
    await writeFileAt(
      root,
      "go.sum",
      "github.com/plinth-dev/starter-api should-not-be-touched\n",
    );
    await writeFileAt(
      root,
      "node_modules/some-pkg/index.js",
      "starter-api should-not-be-touched\n",
    );

    const changed = await applyReplacements(
      root,
      forApi("github.com/acme/billing-api", "billing-api"),
    );
    expect(changed).toBe(3);

    const gomod = await readFileAt(root, "go.mod");
    expect(gomod).toContain("module github.com/acme/billing-api");
    expect(gomod).toContain("github.com/plinth-dev/sdk-go/audit");

    const main = await readFileAt(root, "cmd/server/main.go");
    expect(main).toContain('"github.com/acme/billing-api/internal/handlers"');
    expect(main).toContain('"github.com/plinth-dev/sdk-go/audit"');
    expect(main).toContain("// billing-api entry point");

    const dc = await readFileAt(root, "docker-compose.yml");
    expect(dc).toContain("SERVICE_NAME: billing-api");

    expect(await readFileAt(root, "go.sum")).toContain(
      "starter-api should-not-be-touched",
    );
    expect(await readFileAt(root, "node_modules/some-pkg/index.js")).toContain(
      "starter-api should-not-be-touched",
    );
  });
});

describe("applyReplacements (web)", () => {
  it("rewrites package.json + env defaults + instrumentation", async () => {
    const root = await makeTempRoot();
    await writeFileAt(
      root,
      "package.json",
      `{"name": "starter-web", "version": "0.1.0"}`,
    );
    await writeFileAt(
      root,
      "src/lib/env.ts",
      `SERVICE_NAME: z.string().default("starter-web")`,
    );

    const changed = await applyReplacements(root, forWeb("billing-web"));
    expect(changed).toBe(2);
    expect(await readFileAt(root, "package.json")).toContain(
      `"name": "billing-web"`,
    );
    expect(await readFileAt(root, "src/lib/env.ts")).toContain(
      `default("billing-web")`,
    );
  });
});

describe("applyReplacements", () => {
  it("is idempotent", async () => {
    const root = await makeTempRoot();
    await writeFileAt(
      root,
      "go.mod",
      "module github.com/plinth-dev/starter-api\n",
    );
    const repls = forApi("github.com/acme/billing-api", "billing-api");

    const first = await applyReplacements(root, repls);
    const after1 = await readFileAt(root, "go.mod");
    const second = await applyReplacements(root, repls);
    const after2 = await readFileAt(root, "go.mod");

    expect(first).toBe(1);
    expect(second).toBe(0);
    expect(after2).toBe(after1);
  });

  it("skips binary files", async () => {
    const root = await makeTempRoot();
    const binary = Buffer.concat([
      Buffer.from("starter-web"),
      Buffer.from([0, 1, 2, 3]),
    ]);
    await writeFileAt(root, "logo.png", binary);

    await applyReplacements(root, forWeb("billing-web"));
    const got = await readFile(join(root, "logo.png"));
    expect(Buffer.compare(got, binary)).toBe(0);
  });

  it("returns 0 with empty replacements", async () => {
    const root = await makeTempRoot();
    await writeFileAt(root, "x.txt", "any");
    expect(await applyReplacements(root, [])).toBe(0);
  });
});
