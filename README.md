# Goyang Urban Board

고양시 도시정보 공유용 정적 웹사이트입니다.

## 페이지 구성
- `/index.html`: 메인 대시보드(실시간 기상/대기 + 도시 해설)
- `/pages/about.html`: 사이트 소개
- `/pages/data-policy.html`: 편집·출처 정책
- `/pages/privacy.html`: 개인정보처리방침
- `/pages/terms.html`: 이용약관
- `/pages/contact.html`: 문의

## AdSense 심사 전 확인
1. 도메인과 Search Console 소유권 인증
2. `contact@goyang-urbanboard.example`를 실제 운영 메일로 변경
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
- `node scripts/prepare-national-data.mjs`
  - `data/eum-source.json`과 `data/municipality-source.json`이 있으면 그것만 읽어 `data/notices-audit.json`과 `data/notices.json`을 다시 생성합니다.
  - 공개용 `data/notices.json`에는 `verified` 공고만 남습니다.
