import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const distAssetsDir = path.join(distDir, 'assets');
const rootAssetsDir = path.join(rootDir, 'assets');

const generatedFilePatterns = [
  /^index-.*\.js$/,
  /^index-.*\.css$/,
  /^manifest-.*\.json$/,
  /^jr-radar-mark-.*\.svg$/,
];

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function cleanGeneratedAssets() {
  const entries = await fs.readdir(rootAssetsDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && generatedFilePatterns.some((pattern) => pattern.test(entry.name)))
      .map((entry) => fs.rm(path.join(rootAssetsDir, entry.name), { force: true }))
  );
}

async function copyAssets() {
  const entries = await fs.readdir(distAssetsDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) =>
        fs.copyFile(
          path.join(distAssetsDir, entry.name),
          path.join(rootAssetsDir, entry.name)
        )
      )
  );
}

async function publishIndexHtml() {
  const distIndexPath = path.join(distDir, 'app.html');
  const rootIndexPath = path.join(rootDir, 'index.html');
  const html = await fs.readFile(distIndexPath, 'utf8');

  const normalized = html
    .replace(/\/assets\/index-[^"]+\.js/g, '/assets/index-STATIC.js')
    .replace(/\/assets\/index-[^"]+\.css/g, '/assets/index-STATIC.css')
    .replace(/\/assets\/manifest-[^"]+\.json/g, '/manifest.json')
    .replace(/\/assets\/jr-radar-mark-[^"]+\.svg/g, '/assets/jr-radar-mark.svg');

  await fs.writeFile(rootIndexPath, normalized, 'utf8');
}

async function publishStaticAliases() {
  const entries = await fs.readdir(rootAssetsDir);
  const jsName = entries.find((name) => /^index-.*\.js$/.test(name));
  const cssName = entries.find((name) => /^index-.*\.css$/.test(name));

  if (!jsName || !cssName) {
    throw new Error('static-alias-missing');
  }

  await fs.copyFile(path.join(rootAssetsDir, jsName), path.join(rootAssetsDir, 'index-STATIC.js'));
  await fs.copyFile(path.join(rootAssetsDir, cssName), path.join(rootAssetsDir, 'index-STATIC.css'));
}

async function main() {
  await ensureDir(rootAssetsDir);
  await cleanGeneratedAssets();
  await copyAssets();
  await publishStaticAliases();
  await publishIndexHtml();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
