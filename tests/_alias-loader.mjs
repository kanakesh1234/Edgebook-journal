// Lets plain `node --experimental-strip-types` run project modules: resolves "@/x" and extensionless relative imports.
import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hook = `
import { existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const root = ${JSON.stringify(root)};
const tryExt = (p) => [p, p + ".ts", p + ".tsx", p + "/index.ts"].find((c) => existsSync(c) && !c.endsWith("/") && /\\.(ts|tsx)$/.test(c));
export async function resolve(spec, ctx, next) {
  let base = null;
  if (spec.startsWith("@/")) base = path.join(root, "src", spec.slice(2));
  else if ((spec.startsWith("./") || spec.startsWith("../")) && ctx.parentURL?.startsWith("file:")) base = path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), spec);
  if (base && !/\\.(ts|tsx|mjs|js|json)$/.test(base)) { const hit = tryExt(base); if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true }; }
  return next(spec, ctx);
}`;
register("data:text/javascript," + encodeURIComponent(hook), pathToFileURL(root + "/"));
