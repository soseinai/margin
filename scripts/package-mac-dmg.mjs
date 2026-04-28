import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import os from 'node:os';
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
const writableDmgPath = path.join(dmgDir, `${productName}_${version}_${arch}.rw.dmg`);
const backgroundSourcePath = path.join(repoRoot, 'assets/dmg/background.svg');
const backgroundFileName = 'background.tiff';
const backgroundDirName = '.background';
const backgroundStageDir = path.join(stageDir, backgroundDirName);
const backgroundStagePath = path.join(backgroundStageDir, backgroundFileName);

run('npm', ['--workspace', '@margin/desktop', 'run', 'tauri', '--', 'build', '--bundles', 'app', '--no-sign', '--ci']);

rmSync(stageRoot, { force: true, recursive: true });
rmSync(outputPath, { force: true });
rmSync(writableDmgPath, { force: true });
mkdirSync(stageDir, { recursive: true });
mkdirSync(dmgDir, { recursive: true });
mkdirSync(backgroundStageDir, { recursive: true });

run('ditto', [appPath, path.join(stageDir, `${productName}.app`)]);
symlinkSync('/Applications', path.join(stageDir, 'Applications'));
renderBackgroundImage(backgroundSourcePath, backgroundStagePath);

run('hdiutil', [
  'create',
  '-volname',
  productName,
  '-srcfolder',
  stageDir,
  '-ov',
  '-format',
  'UDRW',
  writableDmgPath
]);

const mountRoot = mkdtempSync(path.join(os.tmpdir(), `${productName.toLowerCase()}-dmg-mount-`));
const mountPoint = path.join(mountRoot, productName);
mkdirSync(mountPoint);

try {
  run('hdiutil', ['attach', writableDmgPath, '-readwrite', '-noverify', '-noautoopen', '-mountpoint', mountPoint]);
  styleMountedDmg(mountPoint);
  run('sync', []);
  run('hdiutil', ['detach', mountPoint]);

  run('hdiutil', [
    'convert',
    writableDmgPath,
    '-format',
    'UDZO',
    '-imagekey',
    'zlib-level=9',
    '-o',
    outputPath
  ]);
} catch (error) {
  spawnSync('hdiutil', ['detach', mountPoint, '-force'], { stdio: 'ignore' });
  throw error;
} finally {
  rmSync(mountRoot, { force: true, recursive: true });
  rmSync(writableDmgPath, { force: true });
}

rmSync(stageRoot, { force: true, recursive: true });
console.log(`Created ${path.relative(repoRoot, outputPath)}`);

function renderBackgroundImage(sourcePath, outputPath) {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), `${productName.toLowerCase()}-dmg-background-`));
  const tmpSvg1xPath = path.join(tmpDir, 'background.svg');
  const tmpSvg2xPath = path.join(tmpDir, 'background@2x.svg');
  const tmpTiff1xPath = path.join(tmpDir, 'background.tiff');
  const tmpTiff2xPath = path.join(tmpDir, 'background@2x.tiff');

  try {
    const sourceSvg = readFileSync(sourcePath, 'utf8');
    const sourceSvg1x = withSvgSize(sourceSvg, 720, 440);
    const sourceSvg2x = withSvgSize(sourceSvg, 1440, 880);

    writeFileSync(tmpSvg1xPath, sourceSvg1x);
    writeFileSync(tmpSvg2xPath, sourceSvg2x);

    run('sips', ['-s', 'format', 'tiff', tmpSvg1xPath, '--out', tmpTiff1xPath]);
    run('sips', ['-s', 'format', 'tiff', tmpSvg2xPath, '--out', tmpTiff2xPath]);
    run('tiffutil', ['-cathidpicheck', tmpTiff1xPath, tmpTiff2xPath, '-out', outputPath]);
  } finally {
    rmSync(tmpDir, { force: true, recursive: true });
  }
}

function withSvgSize(sourceSvg, width, height) {
  return sourceSvg.replace('<svg ', `<svg width="${width}" height="${height}" `);
}

function styleMountedDmg(mountPoint) {
  const appName = `${productName}.app`;
  const backgroundPath = path.join(mountPoint, backgroundDirName, backgroundFileName);
  const script = `
    tell application "Finder"
      set dmgFolder to POSIX file "${escapeAppleScriptString(`${mountPoint}/`)}" as alias
      open dmgFolder
      set dmgWindow to container window of dmgFolder
      set current view of dmgWindow to icon view
      set toolbar visible of dmgWindow to false
      set statusbar visible of dmgWindow to false
      set the bounds of dmgWindow to {120, 120, 840, 560}
      set theViewOptions to the icon view options of dmgWindow
      set arrangement of theViewOptions to not arranged
      set icon size of theViewOptions to 96
      set label position of theViewOptions to bottom
      set background picture of theViewOptions to POSIX file "${escapeAppleScriptString(backgroundPath)}"
      set position of item "${escapeAppleScriptString(appName)}" of dmgFolder to {180, 202}
      set position of item "Applications" of dmgFolder to {540, 202}
      update dmgFolder without registering applications
      delay 1
      close dmgWindow
    end tell
  `;

  run('SetFile', ['-a', 'V', path.join(mountPoint, backgroundDirName)]);
  run('osascript', ['-e', script]);
}

function escapeAppleScriptString(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

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
