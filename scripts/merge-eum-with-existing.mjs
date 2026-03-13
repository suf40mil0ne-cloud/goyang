import fs from 'node:fs';
import path from 'node:path';

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

function readJson(relativePath, fallback = []) {
  const targetPath = path.join(dataDir, relativePath);
  if (!fs.existsSync(targetPath)) return fallback;
  return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
}

function writeJson(targetPath, value) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`);
}

function isUsableUrl(value = '') {
  try {
    new URL(String(value));
    return true;
  } catch {
    return false;
  }
}

function buildStableKey(notice = {}) {
  if (notice.id) return `id:${notice.id}`;
  if (notice.sourceDetailUrl && isUsableUrl(notice.sourceDetailUrl)) return `detail:${notice.sourceDetailUrl}`;
  if (notice.seq) return `hr:${notice.seq}`;
  if (notice.pnncCd) return `ih:${notice.pnncCd}`;
  return `title:${notice.title}:${notice.organization}:${notice.postedDate}`;
}

function main() {
  const dryRun = getFlag('dry-run');
  const useSnapshot = getFlag('use-snapshot');
  const publishPartial = getFlag('publish-partial');
  const stagedPath = getArgValue('input', 'eum-verified.json');
  const snapshotPath = getArgValue('snapshot', 'eum-source.snapshot.json');
  const noticesPath = path.join(dataDir, 'notices.json');
  const existingNotices = readJson('notices.json', []);
  const snapshotNotices = readJson(snapshotPath, []);
  const stagedNotices = readJson(stagedPath, []);

  const safeExisting = Array.isArray(existingNotices) ? existingNotices : [];
  const publishableStage = Array.isArray(stagedNotices)
    ? stagedNotices.filter((item) => item.verificationStatus === 'verified' || (publishPartial && item.verificationStatus === 'partial'))
    : [];

  const stageForMerge = publishableStage.length
    ? publishableStage
    : (useSnapshot && snapshotNotices.length ? snapshotNotices : []);

  const mergedMap = new Map();
  safeExisting.forEach((notice) => {
    mergedMap.set(buildStableKey(notice), notice);
  });
  stageForMerge.forEach((notice) => {
    mergedMap.set(buildStableKey(notice), notice);
  });

  const merged = [...mergedMap.values()];
  const shouldPublish = stageForMerge.length > 0 && merged.length > 0;

  const summary = {
    merge: {
      dryRun,
      useSnapshot,
      publishPartial,
      existingCount: safeExisting.length,
      stagedCount: publishableStage.length,
      snapshotCount: snapshotNotices.length,
      mergeInputCount: stageForMerge.length,
      finalMergedCount: merged.length,
      finalPublishedCount: shouldPublish ? merged.length : safeExisting.length,
      publishedFrom: publishableStage.length ? 'staged' : (stageForMerge.length ? 'snapshot' : 'existing'),
      publishBlocked: !shouldPublish,
    },
  };

  if (!dryRun && shouldPublish) {
    writeJson(noticesPath, merged);
    writeJson(path.join(dataDir, snapshotPath), stageForMerge);
  }

  writeJson(path.join(debugDir, 'eum-stage-summary.json'), {
    ...(readJson('debug/eum-stage-summary.json', {}) || {}),
    ...summary,
  });

  if (!shouldPublish) {
    console.log('No publishable staged EUM records. Existing notices were kept unchanged.');
    return;
  }

  console.log(`${dryRun ? 'Dry-run merged' : 'Published merged'} notices: ${merged.length}`);
}

main();
