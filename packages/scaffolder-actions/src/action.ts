import { createTemplateAction } from "@backstage/plugin-scaffolder-node";
import type { JsonValue } from "@backstage/types";

import { scaffold } from "./scaffold.js";

type ActionInput = {
  name: string;
  web?: boolean;
  api?: boolean;
  modulePath?: string;
  ref?: string;
  [k: string]: JsonValue | undefined;
};

type ActionOutput = {
  apiPath?: string;
  webPath?: string;
  rewrittenFiles: number;
  [k: string]: JsonValue | undefined;
};

/**
 * `plinth:scaffold` — fetches plinth-dev/starter-{web,api}@<ref> into the
 * Backstage scaffolder workspace and rewrites identifier tokens. Output
 * directories live at `<workspace>/<name>-api/` and `<workspace>/<name>-web/`,
 * matching the CLI's layout.
 *
 * Register this action in your Backstage backend's scaffolder module:
 *
 *   import { createPlinthScaffoldAction } from "@plinth-dev/scaffolder-actions";
 *
 *   scaffolder.addModule(scaffolderModuleCustomActions((env) => ({
 *     actions: [createPlinthScaffoldAction()],
 *   })));
 *
 * The schema and behaviour are kept deliberately parallel to `plinth new`
 * (see https://github.com/plinth-dev/cli) so the same input always produces
 * the same output regardless of which surface the user enters from.
 */
export function createPlinthScaffoldAction() {
  return createTemplateAction<ActionInput, ActionOutput>({
    id: "plinth:scaffold",
    description:
      "Scaffold a Plinth module by fetching plinth-dev/starter-{web,api} and rewriting identifiers.",
    schema: {
      input: {
        type: "object",
        required: ["name"],
        properties: {
          name: {
            type: "string",
            description:
              "Module name in lowercase kebab-case. The API tier lands in <name>-api, the web tier in <name>-web.",
          },
          web: {
            type: "boolean",
            description: "Scaffold the web tier (default: true).",
          },
          api: {
            type: "boolean",
            description: "Scaffold the API tier (default: true).",
          },
          modulePath: {
            type: "string",
            description:
              'Go module path for the API (default "github.com/example/<name>-api").',
          },
          ref: {
            type: "string",
            description: 'Starter tag to fetch (default "v0.1.0").',
          },
        },
      },
      output: {
        type: "object",
        properties: {
          apiPath: {
            type: "string",
            description: "Absolute path of the generated API scaffold.",
          },
          webPath: {
            type: "string",
            description: "Absolute path of the generated web scaffold.",
          },
          rewrittenFiles: {
            type: "number",
            description: "Total files modified by the rewrite step.",
          },
        },
      },
    },
    async handler(ctx) {
      const { name, web, api, modulePath, ref } = ctx.input;
      const result = await scaffold({
        name,
        workspace: ctx.workspacePath,
        web,
        api,
        modulePath,
        ref,
        log: (message) => ctx.logger.info(message),
      });
      if (result.apiPath) ctx.output("apiPath", result.apiPath);
      if (result.webPath) ctx.output("webPath", result.webPath);
      ctx.output("rewrittenFiles", result.rewrittenFiles);
    },
  });
}
