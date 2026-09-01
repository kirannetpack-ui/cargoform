import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(projectRoot, "dist");
const manifest = JSON.parse(readFileSync(join(dist, ".vite", "manifest.json"), "utf8"));
const entry = Object.values(manifest).find((item) => item.isEntry);

if (!entry?.file) throw new Error("CargoForm Vite entry was not found in the build manifest");

const publicTarget = join(projectRoot, "public", "cloud-app");
const generatedTarget = join(projectRoot, "cloud", "generated-assets.json");

rmSync(publicTarget, { recursive: true, force: true });
mkdirSync(publicTarget, { recursive: true });
cpSync(dist, publicTarget, { recursive: true });
mkdirSync(dirname(generatedTarget), { recursive: true });
writeFileSync(
  generatedTarget,
  `${JSON.stringify({ script: `/cloud-app/${entry.file}`, css: (entry.css || []).map((file) => `/cloud-app/${file}`) }, null, 2)}\n`,
);
