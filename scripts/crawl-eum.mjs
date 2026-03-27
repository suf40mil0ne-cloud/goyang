import { writeFileSync, mkdirSync } from 'fs';

const EUM_URL = 'https://www.eum.go.kr/web/cp/hr/hrPeopleHearList.jsp?pageNo=1';

const headers = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  Referer: 'https://www.eum.go.kr/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
};

async function crawl() {
  console.log('Fetching EUM hearings...');
  const res = await fetch(EUM_URL, { headers });
  console.log('Status:', res.status);
  const html = await res.text();
  console.log('HTML length:', html.length);

  // 일단 raw HTML 저장 (파싱은 다음 단계)
  mkdirSync('data', { recursive: true });
  writeFileSync('data/eum-hearings-raw.html', html, 'utf-8');
  writeFileSync('data/eum-hearings.json', JSON.stringify({
    crawledAt: new Date().toISOString(),
    status: res.status,
    htmlLength: html.length,
  }, null, 2), 'utf-8');

  console.log('Done!');
}

crawl().catch(e => {
  console.error(e);
  process.exit(1);
});
