const EUM_BASE_URL = 'https://www.eum.go.kr';

function buildListUrl(kind = 'public-hearing', page = 1) {
  const pathname = kind === 'internet-hearing'
    ? '/web/hr/hrPeopleHearList.jsp'
    : '/web/ih/ihPeopleViewList.jsp';

  const url = new URL(pathname, EUM_BASE_URL);
  url.searchParams.set('page', String(page));
  return url.toString();
}

async function fetchListPage(kind, page) {
  const response = await fetch(buildListUrl(kind, page), {
    headers: {
      'user-agent': 'goyang-eum-collector/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`eum-list-${kind}-${page}-${response.status}`);
  }

  return response.text();
}

function parseNoticeList(_html, kind) {
  return [
    {
      id: `${kind}-mock-parser`,
      source: 'eum-collector-structure',
      sourceLabel: '토지이음 수집 구조',
      type: kind === 'internet-hearing' ? '인터넷 의견청취' : '주민공람',
      title: 'TODO: HTML 파서 구현 후 실제 목록으로 교체',
      period: '',
      sido: '',
      sigungu: '',
      regionLabel: '',
      department: '',
      place: '',
      link: EUM_BASE_URL,
      excerpt: '실서비스에서는 목록 HTML을 파싱해 표준 Notice 스키마로 변환합니다.',
      isMock: true,
      updatedAt: new Date().toISOString(),
    },
  ];
}

async function collect(kind, pages = 1) {
  const notices = [];

  for (let page = 1; page <= pages; page += 1) {
    const html = await fetchListPage(kind, page);
    notices.push(...parseNoticeList(html, kind));
  }

  return notices;
}

async function main() {
  const [publicHearing, internetHearing] = await Promise.all([
    collect('public-hearing', 1),
    collect('internet-hearing', 1),
  ]);

  process.stdout.write(
    JSON.stringify(
      {
        collectedAt: new Date().toISOString(),
        publicHearing,
        internetHearing,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
