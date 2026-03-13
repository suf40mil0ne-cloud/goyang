# 공람콕

내 주변 주민공람 정보를 지도에서 콕 확인하는 정적 웹사이트입니다.

## 페이지 구성
- `/index.html`: 메인 대시보드(실시간 기상/대기 + 도시 해설)
- `/pages/about.html`: 사이트 소개
- `/pages/data-policy.html`: 편집·출처 정책
- `/pages/privacy.html`: 개인정보처리방침
- `/pages/terms.html`: 이용약관
- `/pages/contact.html`: 문의

## AdSense 심사 전 확인
1. 도메인과 Search Console 소유권 인증
2. `contact@gongramkok.example`를 실제 운영 메일로 변경
3. AdSense 승인 후 `ads.txt`에 발급된 `pub-` 라인 입력
4. 사이트에 정책 페이지 링크가 정상 동작하는지 확인
5. 충분한 독창 콘텐츠(해설 문서) 지속 추가

## 데이터 출처
- Open-Meteo API
- 고양시청 / KOSIS / 경기도 교통·버스 포털

## 배치 수집
- `node scripts/fetch-eum-batch.mjs --types=hr,ih --max-pages=3`
  - 토지이음 hr/ih 목록을 배치로 수집하고 상세 식별자(`seq`, `pnnc_cd`) 기준으로 상세를 저장합니다.
  - 한글 디코딩은 응답 헤더, meta charset, `euc-kr`/`cp949` fallback 순서로 처리합니다.
  - `--official-source=data/municipality-source.json`
    - 지자체 공식 고시공고/공보/첨부 원문 보강 소스를 exact match 우선으로 병합합니다.
  - `--ih-public-source=data/ih-public-source.json`
    - 인터넷 주민의견청취 공공데이터 보조 메타를 검증/보정 축으로 병합합니다.
- `node scripts/prepare-national-data.mjs`
  - `data/eum-source.json`과 `data/municipality-source.json`만 source-of-truth로 읽어 `data/notices-audit.json`과 `data/notices.json`을 다시 생성합니다.
  - 공개용 `data/notices.json`에는 `verified` 공고만 남습니다.
