#!/usr/bin/env node

import { spawn } from 'node:child_process';

const devUrl = 'http://127.0.0.1:5173/';

async function existingMarginServer() {
  try {
    const response = await fetch(devUrl, { signal: AbortSignal.timeout(600) });
    if (!response.ok) return false;

    const body = await response.text();
    if (body.includes('<title>Margin</title>') && body.includes('/src/main.ts')) {
      return true;
    }

    throw new Error(`${devUrl} is already serving a different app.`);
  } catch (error) {
    if (
      error instanceof TypeError ||
      (error instanceof DOMException && error.name === 'TimeoutError')
    ) {
      return false;
    }

    throw error;
  }
}

if (await existingMarginServer()) {
  console.log(`Margin web is already running at ${devUrl}`);
  process.exit(0);
}

const child = spawn('npm', ['--workspace', '@margin/web', 'run', 'dev'], {
  stdio: 'inherit'
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
