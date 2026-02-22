import { build } from "esbuild";
import { mkdir, copyFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const envValues = await loadDotEnv();
const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? envValues.ANTHROPIC_API_KEY ?? "";

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
    legalComments: "none",
    define: {
      __NWA_ANTHROPIC_API_KEY__: JSON.stringify(anthropicApiKey)
    }
  });
}

const staticFiles = [
  ["manifest.json", "dist/manifest.json"],
  ["src/content/ui/styles.css", "dist/content/ui/styles.css"],
  ["agent.config.json", "dist/agent.config.json"]
];

for (const [source, destination] of staticFiles) {
  const sourcePath = resolve(source);
  const destinationPath = resolve(destination);
  await mkdir(dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
}

async function loadDotEnv() {
  try {
    const content = await readFile(resolve(".env"), "utf8");
    const values = {};

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      const value = rawValue.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
      values[key] = value;
    }

    return values;
  } catch {
    return {};
  }
}
