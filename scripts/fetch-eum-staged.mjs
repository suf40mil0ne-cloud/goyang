import fs from 'node:fs';
import path from 'node:path';

import { collectEumDatasetSafe } from './lib/eum-collector-safe.mjs';

const rootDir = new URL('..', import.meta.url);
const dataDir = path.join(rootDir.pathname, 'data');
const debugDir = path.join(dataDir, 'debug');

function getFlag(name) {
  return process.argv.includes(`--${name}`);
}

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
  const allowed = new Set(['hr', 'ih']);
  const value = getArgValue('types', 'hr,ih');
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
  const dryRun = getFlag('dry-run');
  const types = getTypesArg();
  const maxPages = getNumberArg('max-pages', 2);
  const detailDelayMs = getNumberArg('detail-delay-ms', 150);
  const maxAttempts = getNumberArg('max-attempts', 3);
  const retryDelayMs = getNumberArg('retry-delay-ms', 400);
  const outputPath = path.resolve(rootDir.pathname, getArgValue('output', 'data/eum-raw.json'));

  if (!types.length) {
    throw new Error('At least one source type is required. Use --types=hr,ih');
  }

  const { notices, stageStats } = await collectEumDatasetSafe({
    types,
    maxPages,
    detailDelayMs,
    maxAttempts,
    retryDelayMs,
    onProgress(event) {
      if (event.stage === 'list') {
        console.log(`[${event.sourceType}] list page ${event.pageNo}: ${event.identifiers} identifiers`);
      } else if (event.stage === 'detail') {
        console.log(`[${event.sourceType}] detail ${event.identifier}: ${event.title || 'title-missing'}`);
      }
    },
  });

  const payload = notices.sort((a, b) => {
    const left = new Date(b.hearingEndDate || b.postedDate || 0);
    const right = new Date(a.hearingEndDate || a.postedDate || 0);
    return left - right;
  });

  const summary = {
    fetch: {
      dryRun,
      types,
      hrListRowsCount: stageStats.hr?.listRowsCount || 0,
      ihListRowsCount: stageStats.ih?.listRowsCount || 0,
      detailFetchedCount: (stageStats.hr?.detailFetchedCount || 0) + (stageStats.ih?.detailFetchedCount || 0),
      detailParseSuccessCount: (stageStats.hr?.detailParseSuccessCount || 0) + (stageStats.ih?.detailParseSuccessCount || 0),
      normalizedCount: payload.length,
      failures: [...(stageStats.hr?.fetchFailures || []), ...(stageStats.ih?.fetchFailures || [])],
    },
  };

  writeJson(outputPath, payload);
  writeJson(path.join(debugDir, 'eum-stage-summary.json'), summary);

  console.log(`${dryRun ? 'Dry-run fetched and staged' : 'Saved'} ${payload.length} EUM raw records`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
