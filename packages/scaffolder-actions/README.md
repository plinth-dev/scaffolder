# @plinth-dev/scaffolder-actions

Custom [Backstage](https://backstage.io) scaffolder actions for Plinth. Lets a Backstage portal scaffold a Plinth module pair (web + API) the same way the [`plinth` CLI](https://github.com/plinth-dev/cli) does — fetch the pinned starter tag, rewrite identifier tokens, write the result into the scaffolder workspace.

## Install

```bash
yarn add --cwd packages/backend @plinth-dev/scaffolder-actions
```

`@backstage/plugin-scaffolder-node` is a peer dependency; every Backstage backend already has it.

## Wire up

In your Backstage backend's scaffolder module:

```ts
// packages/backend/src/index.ts
import { createBackend } from "@backstage/backend-defaults";
import scaffolderModule from "@backstage/plugin-scaffolder-backend";
import { createPlinthScaffoldAction } from "@plinth-dev/scaffolder-actions";

const backend = createBackend();
backend.add(scaffolderModule);
backend.add({
  pluginId: "scaffolder",
  moduleId: "plinth-actions",
  register(env) {
    env.registerInit({
      deps: { scaffolder: env.getScaffolderActions },
      async init({ scaffolder }) {
        scaffolder.addActions(createPlinthScaffoldAction());
      },
    });
  },
});
backend.start();
```

The exact wiring varies by Backstage version — adapt to whichever module-extension form your backend uses.

## Action: `plinth:scaffold`

| Input         | Type      | Default                              | Notes |
|---------------|-----------|--------------------------------------|-------|
| `name`        | `string`  | (required)                           | lowercase kebab-case |
| `web`         | `boolean` | `true`                               | scaffold the Next.js starter |
| `api`         | `boolean` | `true`                               | scaffold the Go starter |
| `modulePath`  | `string`  | `github.com/example/<name>-api`      | Go module path |
| `ref`         | `string`  | `v0.1.0`                             | starter tag to fetch |

Outputs `apiPath`, `webPath`, and `rewrittenFiles`.

The rewriter replaces:

- `github.com/plinth-dev/starter-api` → your `modulePath`
- bare `starter-api` → `<name>-api`
- bare `starter-web` → `<name>-web`

It skips `node_modules/`, `.git/`, lockfiles (`go.sum`, `pnpm-lock.yaml`), and binary files.

## Pure functions

The package also exports its building blocks for non-Backstage callers:

```ts
import { scaffold, applyReplacements, fetchAndExtract, forApi, forWeb } from "@plinth-dev/scaffolder-actions";
```

## License

MIT.
