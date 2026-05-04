#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(root, 'apps/web/src/lib/generated/markdown-core');
const sourceWasm = resolve(
  root,
  'target/wasm32-unknown-unknown/release/margin_markdown_core.wasm'
);
const outputWasm = resolve(outputDir, 'margin_markdown_core.wasm');

const cargo = spawnSync(
  'cargo',
  ['build', '-p', 'margin-markdown-core', '--target', 'wasm32-unknown-unknown', '--release'],
  {
    cwd: root,
    stdio: 'inherit'
  }
);

if (cargo.status !== 0) {
  process.exit(cargo.status ?? 1);
}

mkdirSync(outputDir, { recursive: true });
copyFileSync(sourceWasm, outputWasm);

console.log(`Wrote ${outputWasm}`);
