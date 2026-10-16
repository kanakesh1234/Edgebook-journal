// Bundles the REAL app pages for a plain browser, with Next.js replaced by small shims, and compiles the
// project's Tailwind v4 stylesheet with the JS compiler (the native oxide scanner is macOS-only here).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "../..");
const here = import.meta.dirname;
const out = path.join(here, "dist");
const req = createRequire(import.meta.url);
// Prefer a locally installed esbuild (npm i -D esbuild); fall back to the one bundled with a global tsx.
let esbuild;
try { esbuild = req("esbuild"); } catch {
  const G = execSync("npm root -g").toString().trim();
  esbuild = req(path.join(G, "tsx/node_modules/esbuild"));
}
const nm = path.join(root, "node_modules");

execSync("node gen-routes.mjs", { cwd: here, stdio: "ignore" });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// ---- JS + component CSS -------------------------------------------------------------------------
const t0 = Date.now();
await esbuild.build({
  entryPoints: [path.join(here, "entry.tsx")],
  outdir: out, bundle: true, format: "esm", platform: "browser", target: "es2022",
  jsx: "automatic", sourcemap: false, minify: process.env.MINIFY === "1", logLevel: "warning",
  tsconfig: path.join(root, "tsconfig.json"),
  nodePaths: [nm],
  alias: {
    "next/link": path.join(here, "shims/next-link.tsx"),
    "next/navigation": path.join(here, "shims/next-navigation.tsx"),
    "server-only": path.join(here, "shims/server-only.ts"),
  },
  loader: { ".woff2": "file", ".woff": "file", ".ttf": "file", ".png": "file", ".jpg": "file", ".svg": "file" },
  assetNames: "assets/[name]-[hash]",
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify("http://localhost:4173/__supabase"), "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("sb_publishable_harness") },
});

// ---- Tailwind -----------------------------------------------------------------------------------
const { compile } = await import(path.join(nm, "tailwindcss/dist/lib.mjs"));
const cssPath = path.join(root, "src/app/globals.css");
const resolveSheet = (id, base) => {
  const p = id === "tailwindcss" ? path.join(nm, "tailwindcss/index.css")
    : id.startsWith(".") ? path.resolve(base, id)
    : fs.existsSync(path.join(nm, id)) ? path.join(nm, id) : path.join(nm, id + ".css");
  return { path: p, base: path.dirname(p), content: fs.readFileSync(p, "utf8") };
};
const compiler = await compile(fs.readFileSync(cssPath, "utf8"), {
  base: path.dirname(cssPath), onDependency: () => {}, loadStylesheet: async (id, base) => resolveSheet(id, base),
});
const cands = new Set();
(function scan(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) scan(p);
    else if (/\.(tsx?|css|html)$/.test(f.name)) for (const t of fs.readFileSync(p, "utf8").split(/[\s"'`{}<>;,]+/)) if (t && t.length < 200) cands.add(t);
  }
})(path.join(root, "src"));
fs.writeFileSync(path.join(out, "tailwind.css"), compiler.build([...cands]));

fs.writeFileSync(path.join(out, "index.html"), `<!doctype html><html lang="en" data-theme="light"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Edgebook</title>
<script>(function(){try{var t=localStorage.getItem("edgebook.theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}})()</script>
<script>window.process={env:{NODE_ENV:"production"}}</script><link rel="stylesheet" href="/dist/tailwind.css"><link rel="stylesheet" href="/dist/entry.css">
</head><body class="min-h-dvh bg-canvas text-ink antialiased"><div id="root"></div><script type="module" src="/dist/entry.js"></script></body></html>`);
console.log(`built in ${Date.now() - t0}ms · js ${(fs.statSync(path.join(out, "entry.js")).size / 1024 / 1024).toFixed(1)}MB · css ${(fs.statSync(path.join(out, "tailwind.css")).size / 1024).toFixed(0)}KB`);
