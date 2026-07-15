import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const forbidden = [
  "visual-test",
  "VISUAL ACCEPTANCE",
  "仅开发模式 fixture",
  "TAURI_SIGNING_PRIVATE_KEY",
  "BEGIN PRIVATE KEY",
  "fixture step",
];

function files(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

for (const path of files("dist")) {
  const content = readFileSync(path, "utf8");
  for (const marker of forbidden) {
    if (content.includes(marker)) throw new Error(`构建产物包含禁止内容：${marker} (${path})`);
  }
}

console.log("Production frontend contains no development fixture or signing secret markers.");
