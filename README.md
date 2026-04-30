# Plinth — Backstage scaffolder

A [Backstage](https://backstage.io) software template plus the supporting custom actions that scaffold a new Plinth module from inside the developer portal.

> **Status: v0.1.0 — Phase E in progress.**

## What it provides

- `template.yaml` — the Backstage software template with a guided form (module name, web/API toggles, owner team, data class).
- A custom action — `plinth:open-platform-mrs` — that opens MRs against the GitOps repo (Argo Application) and the policies repo (default Cerbos policy).
- The `register-component` step that adds the new module to the Backstage catalog.

## How to add it to your Backstage

```yaml
# app-config.yaml
catalog:
  locations:
    - type: url
      target: https://github.com/plinth-dev/scaffolder/blob/main/template.yaml
      rules:
        - allow: [Template]
```

Then drop the custom action into your Backstage backend:

```bash
yarn add @plinth-dev/scaffolder-actions
```

```ts
// packages/backend/src/plugins/scaffolder.ts
import { plinthOpenPlatformMrsAction } from "@plinth-dev/scaffolder-actions";

export const actions = [
  ...createBuiltinActions({ /* ... */ }),
  plinthOpenPlatformMrsAction({ /* ... */ }),
];
```

## Output parity with the CLI

The Backstage template and the [`plinth` CLI](https://github.com/plinth-dev/cli) produce **identical output** for the same inputs. CI verifies this on every change against a checked-in golden tree.

## Related

- [`cli`](https://github.com/plinth-dev/cli) — the matching CLI flow.
- [`starter-web`](https://github.com/plinth-dev/starter-web) / [`starter-api`](https://github.com/plinth-dev/starter-api) — what the template clones.
- [`platform`](https://github.com/plinth-dev/platform) — the substrate this scaffolder targets.

## License

MIT — see [LICENSE](./LICENSE).
