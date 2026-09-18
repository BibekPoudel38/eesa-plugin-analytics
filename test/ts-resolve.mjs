// Let `node --test` resolve the app's imports the way Next does.
//
// The source uses extensionless relative imports (`../db/pool`) and the `@/`
// alias, both of which the TypeScript/Next resolver understands and plain Node
// ESM does not. Rather than bend the application code to suit the test runner
// — which would mean every file in src/ carrying `.ts` extensions for the sake
// of two test files — the runner is taught the same two rules here.
//
// Loaded with:  node --import ./test/ts-resolve.mjs --conditions=react-server
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const SRC = resolvePath(process.cwd(), "src");

registerHooks({
  resolve(specifier, context, nextResolve) {
    const alias = specifier.startsWith("@/")
      ? resolvePath(SRC, specifier.slice(2))
      : specifier.startsWith(".") && context.parentURL
        ? resolvePath(dirname(fileURLToPath(context.parentURL)), specifier)
        : null;

    if (alias && !/\.[cm]?[jt]sx?$/.test(alias)) {
      for (const candidate of [`${alias}.ts`, `${alias}.tsx`, `${alias}/index.ts`]) {
        if (existsSync(candidate)) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
