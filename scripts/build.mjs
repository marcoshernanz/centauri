import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const entries = [
  {
    entry: "src/background/index.ts",
    outfile: "dist/background/index.js"
  },
  {
    entry: "src/content/index.ts",
    outfile: "dist/content/index.js"
  }
];

for (const item of entries) {
  await build({
    entryPoints: [resolve(item.entry)],
    outfile: resolve(item.outfile),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome114",
    sourcemap: false,
    legalComments: "none"
  });
}

const staticFiles = [
  ["manifest.json", "dist/manifest.json"],
  ["src/content/ui/styles.css", "dist/content/ui/styles.css"]
];

for (const [source, destination] of staticFiles) {
  const sourcePath = resolve(source);
  const destinationPath = resolve(destination);
  await mkdir(dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
}
