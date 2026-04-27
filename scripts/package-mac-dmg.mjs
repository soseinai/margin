import { spawnSync } from 'node:child_process';
import { rmSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const tauriConfigPath = path.join(repoRoot, 'apps/desktop/src-tauri/tauri.conf.json');
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));

const productName = tauriConfig.productName ?? 'Margin';
const version = tauriConfig.version ?? '0.1.0';
const arch = process.arch === 'arm64' ? 'aarch64' : process.arch === 'x64' ? 'x64' : process.arch;
const bundleRoot = path.join(repoRoot, 'target/release/bundle');
const appPath = path.join(bundleRoot, 'macos', `${productName}.app`);
const dmgDir = path.join(bundleRoot, 'dmg');
const stageRoot = path.join(bundleRoot, 'dmg-stage');
const stageDir = path.join(stageRoot, productName);
const outputPath = path.join(dmgDir, `${productName}_${version}_${arch}.dmg`);

run('npm', ['--workspace', '@margin/desktop', 'run', 'tauri', '--', 'build', '--bundles', 'app', '--no-sign', '--ci']);

rmSync(stageRoot, { force: true, recursive: true });
rmSync(outputPath, { force: true });
mkdirSync(stageDir, { recursive: true });
mkdirSync(dmgDir, { recursive: true });

run('ditto', [appPath, path.join(stageDir, `${productName}.app`)]);
symlinkSync('/Applications', path.join(stageDir, 'Applications'));

run('hdiutil', [
  'create',
  '-volname',
  productName,
  '-srcfolder',
  stageDir,
  '-ov',
  '-format',
  'UDZO',
  outputPath
]);

rmSync(stageRoot, { force: true, recursive: true });
console.log(`Created ${path.relative(repoRoot, outputPath)}`);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit'
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
