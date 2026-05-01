import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const tauriConfigPath = path.join(repoRoot, 'apps/desktop/src-tauri/tauri.conf.json');
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));

const productName = tauriConfig.productName ?? 'Margin';
const version = tauriConfig.version ?? '0.1.0';
const tagName = process.env.GITHUB_REF_NAME ?? `v${version}`;
const repository = process.env.GITHUB_REPOSITORY ?? 'soseinai/margin';
const arch = updaterArch();
const bundleRoot = path.join(repoRoot, 'target/release/bundle');
const macosBundleDir = path.join(bundleRoot, 'macos');
const updaterDir = path.join(bundleRoot, 'updater');
const sourceArchive = path.join(macosBundleDir, `${productName}.app.tar.gz`);
const sourceSignature = `${sourceArchive}.sig`;
const archiveName = `${productName}_${version}_${arch}.app.tar.gz`;
const signatureName = `${archiveName}.sig`;
const archivePath = path.join(updaterDir, archiveName);
const signaturePath = path.join(updaterDir, signatureName);
const latestJsonPath = path.join(updaterDir, 'latest.json');

mkdirSync(updaterDir, { recursive: true });
copyFileSync(sourceArchive, archivePath);
copyFileSync(sourceSignature, signaturePath);

const signature = readFileSync(signaturePath, 'utf8').trim();
const assetBaseUrl = `https://github.com/${repository}/releases/download/${tagName}`;
const latest = {
  version,
  notes: 'See the GitHub release notes for this update.',
  pub_date: new Date().toISOString(),
  platforms: {
    [`darwin-${arch}`]: {
      signature,
      url: `${assetBaseUrl}/${archiveName}`
    }
  }
};

writeFileSync(latestJsonPath, `${JSON.stringify(latest, null, 2)}\n`);

console.log(`Created ${path.relative(repoRoot, archivePath)}`);
console.log(`Created ${path.relative(repoRoot, signaturePath)}`);
console.log(`Created ${path.relative(repoRoot, latestJsonPath)}`);

function updaterArch() {
  if (process.env.MARGIN_UPDATER_ARCH) return process.env.MARGIN_UPDATER_ARCH;
  if (process.arch === 'arm64') return 'aarch64';
  if (process.arch === 'x64') return 'x86_64';
  return process.arch;
}
