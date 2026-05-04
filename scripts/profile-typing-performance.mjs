#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const host = '127.0.0.1';
const port = process.env.MARGIN_TYPING_PROFILE_PORT ?? '5181';
const serverUrl = process.env.MARGIN_TYPING_PROFILE_URL ?? `http://${host}:${port}/`;
const profileUrl = new URL(serverUrl);
const sections = (process.env.MARGIN_TYPING_PROFILE_SECTIONS ?? '320,800')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);
const textToType = process.env.MARGIN_TYPING_PROFILE_TEXT ?? 'abcdefghijklmnopqrst';
const typingDelayMs = Number(process.env.MARGIN_TYPING_PROFILE_DELAY_MS ?? '15');

profileUrl.searchParams.set('desktop-preview', '');
profileUrl.searchParams.set('typingProfile', '');

let serverProcess = null;
let stoppingServer = false;

try {
  await ensureServer();
  const results = await profileTyping();

  printResults(results);
} finally {
  if (serverProcess) {
    stoppingServer = true;
    serverProcess.kill('SIGTERM');
  }
}

async function ensureServer() {
  if (await existingMarginServer()) return;
  if (process.env.MARGIN_TYPING_PROFILE_URL) {
    throw new Error(`No Margin web server responded at ${serverUrl}`);
  }

  serverProcess = spawn(
    'npm',
    ['--workspace', '@margin/web', 'run', 'dev', '--', '--host', host, '--port', port],
    {
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  serverProcess.stdout.on('data', (chunk) => {
    if (!stoppingServer) process.stdout.write(`[web] ${chunk}`);
  });
  serverProcess.stderr.on('data', (chunk) => {
    if (!stoppingServer) process.stderr.write(`[web] ${chunk}`);
  });

  const started = Date.now();

  while (Date.now() - started < 120_000) {
    if (await existingMarginServer()) return;
    await delay(250);
  }

  throw new Error(`Timed out waiting for Margin web at ${serverUrl}`);
}

async function existingMarginServer() {
  try {
    const response = await fetch(serverUrl, { signal: AbortSignal.timeout(600) });
    if (!response.ok) return false;

    const body = await response.text();
    if (body.includes('<title>Margin</title>')) return true;

    throw new Error(`${serverUrl} is already serving a different app.`);
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

async function profileTyping() {
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });

    await page.addInitScript(() => {
      window.localStorage.clear();
      window.localStorage.setItem('margin:typing-profiler', '1');
      window.localStorage.setItem('margin:typing-profiler-threshold-ms', '0');
    });
    await page.goto(profileUrl.toString());
    await editor(page).waitFor({ state: 'visible' });

    const results = [];

    for (const sectionCount of sections) {
      results.push(await profileCase(page, sectionCount));
    }

    return results;
  } finally {
    await browser.close();
  }
}

async function profileCase(page, sectionCount) {
  const markdown = benchmarkDocument(sectionCount);
  const markdownLines = lineCount(markdown);

  await editor(page).evaluate((node, text) => {
    const view = node.cmTile?.view;

    if (!view) throw new Error('CodeMirror view unavailable');

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  }, markdown);
  await page.waitForFunction((expectedLength) => {
    const view = document.querySelector('.cm-content[contenteditable="true"]')?.cmTile?.view;

    return view?.state.doc.length === expectedLength;
  }, markdown.length);
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__marginTypingProfiles = [];
  });

  const targetLine = Math.max(1, Math.floor(markdownLines * 0.6));

  await editor(page).evaluate((node, lineNumber) => {
    const view = node.cmTile?.view;

    if (!view) throw new Error('CodeMirror view unavailable');

    const line = view.state.doc.line(Math.min(lineNumber, view.state.doc.lines));

    view.dispatch({ selection: { anchor: line.to } });
    view.focus();
  }, targetLine);
  await page.keyboard.type(textToType, { delay: typingDelayMs });
  await page.waitForTimeout(1000);

  const rows = await page.evaluate(() => window.__marginTypingProfiles ?? []);

  return {
    bytes: new TextEncoder().encode(markdown).length,
    lines: markdownLines,
    rows,
    sections: sectionCount,
    summary: summarize(rows)
  };
}

function editor(page) {
  return page.locator('.cm-content[contenteditable="true"]').first();
}

function benchmarkDocument(sectionCount) {
  const lines = [
    '---',
    'title: Typing profile document',
    'tags:',
    '  - margin',
    '  - profiling',
    '---',
    ''
  ];

  for (let index = 0; index < sectionCount; index += 1) {
    lines.push(
      `# Section ${index + 1}`,
      `Paragraph ${index + 1} with **bold**, _italic_, \`code\`, [link](https://example.com/${index}), $x_${index}$, and ~~removed~~ text.`,
      '',
      '- Parent item',
      '  - Child item',
      '    - Grandchild item',
      '  continuation text under child item',
      '      code under child item',
      '',
      '1. Ordered item',
      '2. Ordered item',
      '   1. Nested ordered item',
      '',
      '| Name | Value |',
      '| --- | :---: |',
      `| Row ${index + 1} | ${index * 7} |`,
      '',
      '$$',
      `x_${index} + y_${index}`,
      '$$',
      '',
      '```ts',
      `const value${index} = ${index};`,
      '```',
      ''
    );
  }

  return lines.join('\n');
}

function summarize(rows) {
  return {
    samples: rows.length,
    parseMean: mean(rows, 'parseMs'),
    parseP95: percentile(rows, 'parseMs', 0.95),
    modelMean: mean(rows, 'modelMs'),
    modelP95: percentile(rows, 'modelMs', 0.95),
    decorationsMean: mean(rows, 'decorationsMs'),
    decorationsP95: percentile(rows, 'decorationsMs', 0.95),
    totalMean: mean(rows, 'totalMs'),
    totalP95: percentile(rows, 'totalMs', 0.95),
    totalMax: max(rows, 'totalMs'),
    rangesMean: mean(rows, 'decorationRanges')
  };
}

function values(rows, field) {
  return rows
    .map((row) => Number(row[field]))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
}

function mean(rows, field) {
  const numbers = values(rows, field);

  if (numbers.length === 0) return 0;

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function percentile(rows, field, percentileValue) {
  const numbers = values(rows, field);

  if (numbers.length === 0) return 0;

  return numbers[Math.min(numbers.length - 1, Math.ceil(numbers.length * percentileValue) - 1)];
}

function max(rows, field) {
  const numbers = values(rows, field);

  return numbers[numbers.length - 1] ?? 0;
}

function printResults(results) {
  const rows = results.map((result) => ({
    sections: result.sections,
    lines: result.lines,
    bytes: result.bytes,
    samples: result.summary.samples,
    parseMean: formatMs(result.summary.parseMean),
    decorationsMean: formatMs(result.summary.decorationsMean),
    totalMean: formatMs(result.summary.totalMean),
    totalP95: formatMs(result.summary.totalP95),
    totalMax: formatMs(result.summary.totalMax),
    rangesMean: Math.round(result.summary.rangesMean)
  }));

  console.table(rows);
}

function formatMs(value) {
  return Number(value.toFixed(2));
}

function lineCount(text) {
  return text.split('\n').length;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
