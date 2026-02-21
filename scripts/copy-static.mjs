import { mkdir, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const filesToCopy = [
  ["manifest.json", "dist/manifest.json"],
  ["src/content/ui/styles.css", "dist/content/ui/styles.css"]
];

for (const [source, destination] of filesToCopy) {
  const sourcePath = resolve(source);
  const destinationPath = resolve(destination);
  await mkdir(dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
}
