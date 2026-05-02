# Plinth — Backstage scaffolder

A [Backstage](https://backstage.io) software template plus a custom action that scaffolds a new Plinth module pair (web + API) from inside the developer portal. Mirrors the [`plinth` CLI](https://github.com/plinth-dev/cli) — same inputs, same output, regardless of which surface the user enters from.

Project docs and the broader Plinth platform: [plinth.run](https://plinth.run).

## Repo layout

| Path                                  | What it is                                               |
|---------------------------------------|----------------------------------------------------------|
| `template.yaml`                       | Backstage software template — registered in your catalog |
| `packages/scaffolder-actions/`        | `@plinth-dev/scaffolder-actions` npm package             |

## Add it to your Backstage

### 1. Install the actions package

```bash
yarn add --cwd packages/backend @plinth-dev/scaffolder-actions
```

`@backstage/plugin-scaffolder-node` is a peer dependency — every Backstage backend already has it.

### 2. Register the `plinth:scaffold` action

```ts
// packages/backend/src/index.ts
import { createPlinthScaffoldAction } from "@plinth-dev/scaffolder-actions";

// Inside whichever scaffolder module-extension form your backend uses:
scaffolder.addActions(createPlinthScaffoldAction());
```

### 3. Register the template in your catalog

```yaml
# app-config.yaml
catalog:
  locations:
    - type: url
      target: https://github.com/plinth-dev/scaffolder/blob/main/template.yaml
      rules:
        - allow: [Template]
```

## What the template does

The template asks for:
- **Name** — lowercase kebab-case
- **Go module path** — defaults to `github.com/example/<name>-api`
- **Tiers** — web, API, or both
- **Starter tag** — defaults to `v0.1.0`

Then `plinth:scaffold` runs:
1. Fetches `https://codeload.github.com/plinth-dev/starter-{web,api}/tar.gz/refs/tags/<ref>`.
2. Strips the `<repo>-<ref>/` prefix and writes into the scaffolder workspace.
3. Rewrites identifier tokens:
   - `github.com/plinth-dev/starter-api` → your `modulePath`
   - bare `starter-api` → `<name>-api`
   - bare `starter-web` → `<name>-web`
4. Skips `node_modules/`, `.git/`, lockfiles, and binary files.

Output directories live at `<workspace>/<name>-api/` and `<workspace>/<name>-web/`.

## Output parity with the CLI

The Backstage template and `plinth new` are intended to produce **byte-identical output** for the same input — the rewrite rules and fetch URL are the same. A golden-tree CI check that diffs both surfaces is on the roadmap.

## Develop

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

The action package's pure functions (`scaffold`, `applyReplacements`, `fetchAndExtract`) are also exported for non-Backstage callers.

## Related

- [`cli`](https://github.com/plinth-dev/cli) — the matching CLI flow.
- [`starter-web`](https://github.com/plinth-dev/starter-web) / [`starter-api`](https://github.com/plinth-dev/starter-api) — what the template fetches.
- [`platform`](https://github.com/plinth-dev/platform) — the substrate this scaffolder targets.

## License

MIT — see [LICENSE](./LICENSE).
