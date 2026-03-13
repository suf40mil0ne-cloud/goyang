import fs from 'node:fs';
import path from 'node:path';

import { collectEumDataset } from './lib/eum-collector.mjs';

const rootDir = new URL('..', import.meta.url);

function getArgValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function getNumberArg(name, fallback) {
  const value = Number(getArgValue(name, ''));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getTypesArg() {
  const value = getArgValue('types', 'hr,ih');
  const allowed = new Set(['hr', 'ih']);
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => allowed.has(item));
}

function writeJson(targetPath, value) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const types = getTypesArg();
  const maxPages = getNumberArg('max-pages', 3);
  const detailDelayMs = getNumberArg('detail-delay-ms', 250);
  const outputPath = path.resolve(rootDir.pathname, getArgValue('output', 'data/eum-source.json'));

  if (!types.length) {
    throw new Error('At least one source type is required. Use --types=hr,ih');
  }

  const notices = await collectEumDataset({
    types,
    maxPages,
    detailDelayMs,
    onProgress(event) {
      if (event.stage === 'list') {
        console.log(`[${event.sourceType}] list page ${event.pageNo}: ${event.identifiers} identifiers`);
      } else if (event.stage === 'detail') {
        console.log(`[${event.sourceType}] detail ${event.identifier}: ${event.title || 'title-missing'}`);
      }
    },
  });

  const payload = notices.sort((a, b) => new Date(b.hearingEndDate || b.postedDate || 0) - new Date(a.hearingEndDate || a.postedDate || 0));
  writeJson(outputPath, payload);

  console.log(`Saved ${payload.length} EUM notices to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
