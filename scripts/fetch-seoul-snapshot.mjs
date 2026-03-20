import fs from 'node:fs/promises';

const sourceUrl = 'http://openapi.seoul.go.kr:8088/714563777567757338346d70445972/xml/TbWcmBoardB0414/1/80/';
const outputPath = new URL('../data/seoul-open-api.xml', import.meta.url);

async function main() {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`seoul-snapshot-${response.status}`);
  }

  const xml = await response.text();
  await fs.writeFile(outputPath, xml, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
