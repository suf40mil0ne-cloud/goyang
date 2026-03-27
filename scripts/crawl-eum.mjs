import { writeFileSync, mkdirSync } from 'fs';

const BASE_URL = 'https://www.eum.go.kr';
const LIST_URL = `${BASE_URL}/web/cp/hr/hrPeopleHearList.jsp`;

const headers = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  Referer: 'https://www.eum.go.kr/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
};

function decodeEucKr(buffer) {
  return new TextDecoder('euc-kr').decode(buffer);
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers });
  const buffer = await res.arrayBuffer();
  return decodeEucKr(buffer);
}

function extractLastPageNo(html) {
  const direct = html.match(/pageNo=(\d+)[^>]*title="마지막 페이지로 이동"/i);
  if (direct?.[1]) return parseInt(direct[1], 10);
  const pageMatches = [...html.matchAll(/pageNo=(\d+)/gi)].map(m => parseInt(m[1], 10));
  return pageMatches.length ? Math.max(...pageMatches) : 1;
}

function parseListHtml(html, pageNo) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1]);
  const items = [];

  for (const rowHtml of rows) {
    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
    if (cells.length < 5) continue;

    const anchorMatch = cells[1].match(/<a\b[^>]*href=(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/i);
    if (!anchorMatch) continue;

    const href = new URL(anchorMatch[2], BASE_URL).toString();
    const seq = new URL(href).searchParams.get('seq') || '';
    if (!seq) continue;

    const title = anchorMatch[3].replace(/<[^>]+>/g, '').trim();
    const noticeNumber = cells[0].replace(/<[^>]+>/g, '').trim();
    const agency = cells[2].replace(/<[^>]+>/g, '').trim();
    const periodText = cells[3].replace(/<[^>]+>/g, '').trim();
    const publishedAt = cells[4].replace(/<[^>]+>/g, '').trim();

    const dates = [...periodText.matchAll(/(\d{4})[.\-\/년\s]+(\d{1,2})[.\-\/월\s]+(\d{1,2})/g)];
    const normalized = dates.map(m => `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`);

    items.push({
      seq,
      title,
      noticeNumber,
      agency,
      publishedAt,
      hearingStartDate: normalized[0] || '',
      hearingEndDate: normalized[1] || normalized[0] || '',
      detailUrl: href,
      listPage: pageNo,
    });
  }

  return { items, lastPageNo: extractLastPageNo(html) };
}

async function crawl() {
  console.log('Fetching page 1...');
  const firstHtml = await fetchHtml(`${LIST_URL}?pageNo=1`);
  const { items: firstItems, lastPageNo } = parseListHtml(firstHtml, 1);
  console.log(`Total pages: ${lastPageNo}, page 1 items: ${firstItems.length}`);

  const allItems = [...firstItems];
  const pagesToFetch = Math.min(lastPageNo, 5); // 최대 5페이지

  for (let page = 2; page <= pagesToFetch; page++) {
    console.log(`Fetching page ${page}...`);
    const html = await fetchHtml(`${LIST_URL}?pageNo=${page}`);
    const { items } = parseListHtml(html, page);
    console.log(`Page ${page} items: ${items.length}`);
    allItems.push(...items);
  }

  mkdirSync('data', { recursive: true });
  writeFileSync('data/eum-hearings.json', JSON.stringify({
    crawledAt: new Date().toISOString(),
    count: allItems.length,
    items: allItems,
  }, null, 2), 'utf-8');

  console.log(`Done! Total items: ${allItems.length}`);
}

crawl().catch(e => {
  console.error(e);
  process.exit(1);
});
