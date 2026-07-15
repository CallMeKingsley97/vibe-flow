import { existsSync, readFileSync } from "node:fs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const packageJson = readJson("package.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");
const cargoToml = readFileSync("src-tauri/Cargo.toml", "utf8");
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const versions = new Set([packageJson.version, tauriConfig.version, cargoVersion]);

if (versions.size !== 1 || versions.has(undefined)) {
  throw new Error(
    `版本不一致：package=${packageJson.version}, tauri=${tauriConfig.version}, cargo=${cargoVersion}`,
  );
}

const updater = tauriConfig.plugins?.updater;
if (!tauriConfig.bundle?.createUpdaterArtifacts || !updater?.pubkey || !updater.endpoints?.length) {
  throw new Error("Updater 产物、公钥或更新端点尚未完整配置");
}

const bundleIcons = new Set(tauriConfig.bundle?.icon ?? []);
for (const requiredIcon of [
  "icons/32x32.png",
  "icons/128x128.png",
  "icons/icon.icns",
  "icons/icon.ico",
]) {
  if (!bundleIcons.has(requiredIcon) || !existsSync(`src-tauri/${requiredIcon}`)) {
    throw new Error(`缺少发布图标配置或文件：${requiredIcon}`);
  }
}

for (const forbidden of [
  "src-tauri/tauri.key",
  "src-tauri/updater.key",
  ".env",
  ".env.production",
]) {
  if (existsSync(forbidden)) throw new Error(`仓库中发现禁止提交的敏感文件：${forbidden}`);
}

for (const required of [
  "README.md",
  "CHANGELOG.md",
  "RELEASE_NOTES.md",
  "docs/INSTALLATION.md",
  "docs/QUICK_START.md",
  "docs/TROUBLESHOOTING.md",
  "docs/PRIVACY.md",
  "docs/KNOWN_LIMITATIONS.md",
  "docs/RELEASE.md",
]) {
  if (!existsSync(required)) throw new Error(`缺少发布文档：${required}`);
}

console.log(`Vibe Flow ${packageJson.version} release configuration is ready.`);
