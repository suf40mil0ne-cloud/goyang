import fs from 'node:fs';
import path from 'node:path';

const rootDir = new URL('..', import.meta.url);
const dataDir = path.join(rootDir.pathname, 'data');

const sidoCatalog = [
  { sido: '서울특별시', shortName: '서울', area: 'seoul', adminCode: '11', centerLat: 37.5665, centerLng: 126.978, defaultZoom: 11, focus: '자치구 단위 주민공람 탐색', aliases: ['서울', '서울특별시'] },
  { sido: '부산광역시', shortName: '부산', area: 'busan', adminCode: '26', centerLat: 35.1796, centerLng: 129.0756, defaultZoom: 11, focus: '구·군 단위 주민공람 탐색', aliases: ['부산', '부산광역시'] },
  { sido: '대구광역시', shortName: '대구', area: 'daegu', adminCode: '27', centerLat: 35.8714, centerLng: 128.6014, defaultZoom: 11, focus: '구·군 단위 주민공람 탐색', aliases: ['대구', '대구광역시'] },
  { sido: '인천광역시', shortName: '인천', area: 'incheon', adminCode: '28', centerLat: 37.4563, centerLng: 126.7052, defaultZoom: 11, focus: '구·군 단위 주민공람 탐색', aliases: ['인천', '인천광역시'] },
  { sido: '광주광역시', shortName: '광주', area: 'gwangju', adminCode: '29', centerLat: 35.1595, centerLng: 126.8526, defaultZoom: 11, focus: '구 단위 주민공람 탐색', aliases: ['광주', '광주광역시'] },
  { sido: '대전광역시', shortName: '대전', area: 'daejeon', adminCode: '30', centerLat: 36.3504, centerLng: 127.3845, defaultZoom: 11, focus: '구 단위 주민공람 탐색', aliases: ['대전', '대전광역시'] },
  { sido: '울산광역시', shortName: '울산', area: 'ulsan', adminCode: '31', centerLat: 35.5384, centerLng: 129.3114, defaultZoom: 11, focus: '구·군 단위 주민공람 탐색', aliases: ['울산', '울산광역시'] },
  { sido: '세종특별자치시', shortName: '세종', area: 'sejong', adminCode: '36', centerLat: 36.4800, centerLng: 127.2890, defaultZoom: 11, focus: '단일 행정구역 주민공람 탐색', aliases: ['세종', '세종특별자치시'] },
  { sido: '경기도', shortName: '경기', area: 'gyeonggi', adminCode: '41', centerLat: 37.4138, centerLng: 127.5183, defaultZoom: 9, focus: '시·군·구 단위 주민공람 탐색', aliases: ['경기', '경기도'] },
  { sido: '강원특별자치도', shortName: '강원', area: 'gangwon', adminCode: '42', centerLat: 37.8228, centerLng: 128.1555, defaultZoom: 9, focus: '시·군 단위 주민공람 탐색', aliases: ['강원', '강원특별자치도'] },
  { sido: '충청북도', shortName: '충북', area: 'chungbuk', adminCode: '43', centerLat: 36.6358, centerLng: 127.4914, defaultZoom: 9, focus: '시·군 단위 주민공람 탐색', aliases: ['충북', '충청북도'] },
  { sido: '충청남도', shortName: '충남', area: 'chungnam', adminCode: '44', centerLat: 36.6588, centerLng: 126.6728, defaultZoom: 9, focus: '시·군 단위 주민공람 탐색', aliases: ['충남', '충청남도'] },
  { sido: '전북특별자치도', shortName: '전북', area: 'jeonbuk', adminCode: '45', centerLat: 35.8201, centerLng: 127.1089, defaultZoom: 9, focus: '시·군 단위 주민공람 탐색', aliases: ['전북', '전북특별자치도'] },
  { sido: '전라남도', shortName: '전남', area: 'jeonnam', adminCode: '46', centerLat: 34.8161, centerLng: 126.4630, defaultZoom: 9, focus: '시·군 단위 주민공람 탐색', aliases: ['전남', '전라남도'] },
  { sido: '경상북도', shortName: '경북', area: 'gyeongbuk', adminCode: '47', centerLat: 36.4919, centerLng: 128.8889, defaultZoom: 9, focus: '시·군 단위 주민공람 탐색', aliases: ['경북', '경상북도'] },
  { sido: '경상남도', shortName: '경남', area: 'gyeongnam', adminCode: '48', centerLat: 35.4606, centerLng: 128.2132, defaultZoom: 9, focus: '시·군 단위 주민공람 탐색', aliases: ['경남', '경상남도'] },
  { sido: '제주특별자치도', shortName: '제주', area: 'jeju', adminCode: '50', centerLat: 33.4996, centerLng: 126.5312, defaultZoom: 10, focus: '시 단위 주민공람 탐색', aliases: ['제주', '제주특별자치도'] },
];

const seedSigunguCatalog = [
  { sido: '서울특별시', sigungu: '강서구', adminCode: '11500', centerLat: 37.5509, centerLng: 126.8495, aliases: ['강서', '서울 강서구'] },
  { sido: '서울특별시', sigungu: '동작구', adminCode: '11590', centerLat: 37.5124, centerLng: 126.9393, aliases: ['동작', '서울 동작구'] },
  { sido: '서울특별시', sigungu: '서대문구', adminCode: '11410', centerLat: 37.5791, centerLng: 126.9368, aliases: ['서대문', '서울 서대문구'] },
  { sido: '서울특별시', sigungu: '성동구', adminCode: '11200', centerLat: 37.5633, centerLng: 127.0369, aliases: ['성동', '서울 성동구'] },
  { sido: '서울특별시', sigungu: '영등포구', adminCode: '11560', centerLat: 37.5264, centerLng: 126.8962, aliases: ['영등포', '서울 영등포구'] },
  { sido: '서울특별시', sigungu: '은평구', adminCode: '11380', centerLat: 37.6176, centerLng: 126.9227, aliases: ['은평', '서울 은평구'] },
  { sido: '부산광역시', sigungu: '해운대구', adminCode: '26350', centerLat: 35.1631, centerLng: 129.1636, aliases: ['해운대', '부산 해운대구'] },
  { sido: '부산광역시', sigungu: '수영구', adminCode: '26500', centerLat: 35.1458, centerLng: 129.1139, aliases: ['수영', '부산 수영구'] },
  { sido: '대구광역시', sigungu: '수성구', adminCode: '27260', centerLat: 35.8584, centerLng: 128.6306, aliases: ['수성', '대구 수성구'] },
  { sido: '대구광역시', sigungu: '달서구', adminCode: '27290', centerLat: 35.8299, centerLng: 128.5326, aliases: ['달서', '대구 달서구'] },
  { sido: '인천광역시', sigungu: '계양구', adminCode: '28245', centerLat: 37.5371, centerLng: 126.7378, aliases: ['계양', '인천 계양구'] },
  { sido: '인천광역시', sigungu: '부평구', adminCode: '28237', centerLat: 37.5071, centerLng: 126.7218, aliases: ['부평', '인천 부평구'] },
  { sido: '인천광역시', sigungu: '서구', adminCode: '28260', centerLat: 37.5454, centerLng: 126.6758, aliases: ['인천 서구', '서구'] },
  { sido: '인천광역시', sigungu: '연수구', adminCode: '28185', centerLat: 37.4103, centerLng: 126.6788, aliases: ['연수', '인천 연수구', '송도'] },
  { sido: '광주광역시', sigungu: '북구', adminCode: '29170', centerLat: 35.1740, centerLng: 126.9119, aliases: ['광주 북구', '북구'] },
  { sido: '광주광역시', sigungu: '광산구', adminCode: '29200', centerLat: 35.1392, centerLng: 126.7935, aliases: ['광주 광산구', '광산구'] },
  { sido: '대전광역시', sigungu: '유성구', adminCode: '30200', centerLat: 36.3622, centerLng: 127.3568, aliases: ['대전 유성구', '유성'] },
  { sido: '대전광역시', sigungu: '서구', adminCode: '30170', centerLat: 36.3555, centerLng: 127.3839, aliases: ['대전 서구', '대전 서구청'] },
  { sido: '울산광역시', sigungu: '남구', adminCode: '31140', centerLat: 35.5438, centerLng: 129.3301, aliases: ['울산 남구', '남구'] },
  { sido: '울산광역시', sigungu: '중구', adminCode: '31110', centerLat: 35.5694, centerLng: 129.3320, aliases: ['울산 중구', '중구'] },
  { sido: '세종특별자치시', sigungu: '세종특별자치시', adminCode: '36110', centerLat: 36.4800, centerLng: 127.2890, aliases: ['세종', '세종시'] },
  { sido: '경기도', sigungu: '고양시 덕양구', adminCode: '41281', centerLat: 37.6375, centerLng: 126.8329, aliases: ['고양', '덕양', '고양시 덕양구'] },
  { sido: '경기도', sigungu: '구리시', adminCode: '41310', centerLat: 37.5943, centerLng: 127.1296, aliases: ['구리', '구리시'] },
  { sido: '경기도', sigungu: '남양주시', adminCode: '41360', centerLat: 37.6360, centerLng: 127.2165, aliases: ['남양주', '남양주시'] },
  { sido: '경기도', sigungu: '부천시', adminCode: '41190', centerLat: 37.5034, centerLng: 126.7660, aliases: ['부천', '부천시'] },
  { sido: '경기도', sigungu: '성남시 수정구', adminCode: '41131', centerLat: 37.4494, centerLng: 127.1459, aliases: ['성남 수정', '수정구', '성남시 수정구'] },
  { sido: '경기도', sigungu: '수원시 권선구', adminCode: '41113', centerLat: 37.2577, centerLng: 126.9707, aliases: ['수원 권선', '권선구', '수원시 권선구'] },
  { sido: '경기도', sigungu: '수원시 영통구', adminCode: '41117', centerLat: 37.2596, centerLng: 127.0465, aliases: ['수원 영통', '영통구', '수원시 영통구'] },
  { sido: '경기도', sigungu: '안양시 동안구', adminCode: '41173', centerLat: 37.3925, centerLng: 126.9568, aliases: ['안양 동안', '동안구', '안양시 동안구'] },
  { sido: '경기도', sigungu: '화성시', adminCode: '41590', centerLat: 37.1995, centerLng: 126.8310, aliases: ['화성', '화성시'] },
  { sido: '강원특별자치도', sigungu: '춘천시', adminCode: '42110', centerLat: 37.8813, centerLng: 127.7298, aliases: ['춘천', '춘천시'] },
  { sido: '강원특별자치도', sigungu: '원주시', adminCode: '42130', centerLat: 37.3422, centerLng: 127.9202, aliases: ['원주', '원주시'] },
  { sido: '충청북도', sigungu: '청주시 흥덕구', adminCode: '43113', centerLat: 36.6424, centerLng: 127.4290, aliases: ['청주 흥덕', '흥덕구', '청주시 흥덕구'] },
  { sido: '충청북도', sigungu: '충주시', adminCode: '43130', centerLat: 36.9910, centerLng: 127.9259, aliases: ['충주', '충주시'] },
  { sido: '충청남도', sigungu: '천안시 서북구', adminCode: '44133', centerLat: 36.8151, centerLng: 127.1139, aliases: ['천안 서북', '서북구', '천안시 서북구'] },
  { sido: '충청남도', sigungu: '아산시', adminCode: '44200', centerLat: 36.7899, centerLng: 127.0025, aliases: ['아산', '아산시'] },
  { sido: '전북특별자치도', sigungu: '전주시 완산구', adminCode: '45111', centerLat: 35.8242, centerLng: 127.1460, aliases: ['전주 완산', '완산구', '전주시 완산구'] },
  { sido: '전북특별자치도', sigungu: '익산시', adminCode: '45140', centerLat: 35.9483, centerLng: 126.9577, aliases: ['익산', '익산시'] },
  { sido: '전라남도', sigungu: '순천시', adminCode: '46150', centerLat: 34.9507, centerLng: 127.4875, aliases: ['순천', '순천시'] },
  { sido: '전라남도', sigungu: '목포시', adminCode: '46110', centerLat: 34.8118, centerLng: 126.3922, aliases: ['목포', '목포시'] },
  { sido: '경상북도', sigungu: '포항시 남구', adminCode: '47111', centerLat: 36.0190, centerLng: 129.3435, aliases: ['포항 남구', '포항시 남구'] },
  { sido: '경상북도', sigungu: '구미시', adminCode: '47190', centerLat: 36.1195, centerLng: 128.3446, aliases: ['구미', '구미시'] },
  { sido: '경상남도', sigungu: '창원시 성산구', adminCode: '48123', centerLat: 35.1984, centerLng: 128.7028, aliases: ['창원 성산', '창원시 성산구'] },
  { sido: '경상남도', sigungu: '김해시', adminCode: '48250', centerLat: 35.2281, centerLng: 128.8894, aliases: ['김해', '김해시'] },
  { sido: '제주특별자치도', sigungu: '제주시', adminCode: '50110', centerLat: 33.4996, centerLng: 126.5312, aliases: ['제주 시내', '제주시'] },
  { sido: '제주특별자치도', sigungu: '서귀포시', adminCode: '50130', centerLat: 33.2541, centerLng: 126.5600, aliases: ['서귀포', '서귀포시'] },
];

const fullSigunguBySido = {
  서울특별시: ['종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구', '도봉구', '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구', '구로구', '금천구', '영등포구', '동작구', '관악구', '서초구', '강남구', '송파구', '강동구'],
  부산광역시: ['중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구', '북구', '해운대구', '사하구', '금정구', '강서구', '연제구', '수영구', '사상구', '기장군'],
  대구광역시: ['중구', '동구', '서구', '남구', '북구', '수성구', '달서구', '달성군', '군위군'],
  인천광역시: ['중구', '동구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '서구', '강화군', '옹진군'],
  광주광역시: ['동구', '서구', '남구', '북구', '광산구'],
  대전광역시: ['동구', '중구', '서구', '유성구', '대덕구'],
  울산광역시: ['중구', '남구', '동구', '북구', '울주군'],
  세종특별자치시: ['세종특별자치시'],
  경기도: ['수원시 장안구', '수원시 권선구', '수원시 팔달구', '수원시 영통구', '성남시 수정구', '성남시 중원구', '성남시 분당구', '의정부시', '안양시 만안구', '안양시 동안구', '부천시', '광명시', '평택시', '동두천시', '안산시 상록구', '안산시 단원구', '고양시 덕양구', '고양시 일산동구', '고양시 일산서구', '과천시', '구리시', '남양주시', '오산시', '시흥시', '군포시', '의왕시', '하남시', '용인시 처인구', '용인시 기흥구', '용인시 수지구', '파주시', '이천시', '안성시', '김포시', '화성시', '광주시', '양주시', '포천시', '여주시', '연천군', '가평군', '양평군'],
  강원특별자치도: ['춘천시', '원주시', '강릉시', '동해시', '태백시', '속초시', '삼척시', '홍천군', '횡성군', '영월군', '평창군', '정선군', '철원군', '화천군', '양구군', '인제군', '고성군', '양양군'],
  충청북도: ['청주시 상당구', '청주시 서원구', '청주시 흥덕구', '청주시 청원구', '충주시', '제천시', '보은군', '옥천군', '영동군', '증평군', '진천군', '괴산군', '음성군', '단양군'],
  충청남도: ['천안시 동남구', '천안시 서북구', '공주시', '보령시', '아산시', '서산시', '논산시', '계룡시', '당진시', '금산군', '부여군', '서천군', '청양군', '홍성군', '예산군', '태안군'],
  전북특별자치도: ['전주시 완산구', '전주시 덕진구', '군산시', '익산시', '정읍시', '남원시', '김제시', '완주군', '진안군', '무주군', '장수군', '임실군', '순창군', '고창군', '부안군'],
  전라남도: ['목포시', '여수시', '순천시', '나주시', '광양시', '담양군', '곡성군', '구례군', '고흥군', '보성군', '화순군', '장흥군', '강진군', '해남군', '영암군', '무안군', '함평군', '영광군', '장성군', '완도군', '진도군', '신안군'],
  경상북도: ['포항시 남구', '포항시 북구', '경주시', '김천시', '안동시', '구미시', '영주시', '영천시', '상주시', '문경시', '경산시', '의성군', '청송군', '영양군', '영덕군', '청도군', '고령군', '성주군', '칠곡군', '예천군', '봉화군', '울진군', '울릉군'],
  경상남도: ['창원시 의창구', '창원시 성산구', '창원시 마산합포구', '창원시 마산회원구', '창원시 진해구', '진주시', '통영시', '사천시', '김해시', '밀양시', '거제시', '양산시', '의령군', '함안군', '창녕군', '고성군', '남해군', '하동군', '산청군', '함양군', '거창군', '합천군'],
  제주특별자치도: ['제주시', '서귀포시'],
};

function buildSigunguAliases(sido, sigungu) {
  const aliases = new Set([sigungu]);
  const shortSido = sidoCatalog.find((item) => item.sido === sido)?.shortName || sido.replace(/특별자치도|특별자치시|특별시|광역시|도/g, '');
  aliases.add(`${shortSido} ${sigungu}`);

  const stripped = sigungu
    .replace(/^(수원시|성남시|안양시|안산시|고양시|용인시|청주시|천안시|전주시|포항시|창원시)\s+/u, '')
    .trim();

  if (stripped && stripped !== sigungu) aliases.add(stripped);
  if (sigungu.endsWith('구')) aliases.add(sigungu.replace(/구$/u, ''));
  if (sigungu.endsWith('시')) aliases.add(sigungu.replace(/시$/u, ''));
  if (sigungu.endsWith('군')) aliases.add(sigungu.replace(/군$/u, ''));

  return [...aliases].filter(Boolean);
}

const seedSigunguMap = new Map(seedSigunguCatalog.map((item) => [`${item.sido}::${item.sigungu}`, item]));

const sigunguCatalog = sidoCatalog.flatMap((sido) =>
  (fullSigunguBySido[sido.sido] || []).map((sigungu) => {
    const seeded = seedSigunguMap.get(`${sido.sido}::${sigungu}`);
    return {
      sido: sido.sido,
      sigungu,
      adminCode: seeded?.adminCode || '',
      centerLat: seeded?.centerLat ?? sido.centerLat,
      centerLng: seeded?.centerLng ?? sido.centerLng,
      aliases: seeded?.aliases || buildSigunguAliases(sido.sido, sigungu),
    };
  })
);

const nationalNoticeSeeds = [
  {
    id: 'bs-2026-001',
    sourceType: 'land-hearing',
    sourceNoticeId: 'LEGACY-BS-2026-001',
    title: '우동 해안보행축 도시계획시설(보행자도로) 결정(안) 주민공람',
    slug: 'busan-haeundae-woodong-promenade-2026',
    sourceUrl: 'https://www.haeundae.go.kr/',
    organization: '부산광역시 해운대구청',
    sido: '부산광역시',
    sigungu: '해운대구',
    legalDong: '우동',
    latitude: 35.1635,
    longitude: 129.1638,
    locationText: '부산광역시 해운대구 우동 해안권 일원',
    projectType: '도시계획시설',
    postedDate: '2026-03-05',
    hearingStartDate: '2026-03-06',
    hearingEndDate: '2026-03-20',
    status: 'ongoing',
    hearingType: '주민의견청취 공람',
    shortSummary: '해안 보행축과 보행자도로 배치를 조정하는 공람입니다.',
    aiSummary: '해운대 해안권 보행축을 도시계획시설로 정비하는 안입니다. 인근 거주자와 상가 이용자는 보행 동선과 차량 진출입 변화 가능성을 확인하는 것이 좋습니다. 실제 의견 제출처와 마감 시각은 원문 공고를 기준으로 다시 확인해야 합니다.',
    impactSummary: '보행 이동선, 관광객 흐름, 상가 전면 접근성에 영향을 줄 수 있습니다.',
    whyPublicReview: '보행자도로와 해안 접근 체계 변경은 생활권 동선과 상권 이용 방식에 직접 연결되기 때문입니다.',
    whoShouldCare: '우동 거주자, 해안 상가 운영자, 보행 중심 이동이 많은 주민',
    submissionMethod: '해운대구 도시관리과 방문 제출 또는 우편 접수',
    submissionPlace: '해운대구청 도시관리과',
    submissionDeadlineText: '2026년 3월 20일 마감 예정, 접수 시간은 원문 기준 확인 필요',
    contact: '부산광역시 해운대구 도시관리과',
    viewLocation: '해운대구청 도시관리과',
    attachments: [{ label: '해운대구 공고문', url: 'https://www.haeundae.go.kr/' }],
    rawSourceName: '해운대구청 고시공고',
    rawText: '우동 해안보행축 도시계획시설 결정(안) 주민공람 요약',
    rawHtml: '<p>우동 해안보행축 도시계획시설 결정(안) 주민공람</p>',
    relatedNotices: [],
    relatedGosi: [],
    lastFetchedAt: '2026-03-10T00:00:00+09:00',
    lastVerifiedAt: '2026-03-11T09:00:00+09:00',
    locationConfidence: 0.8,
    impactTags: ['보행', '해안', '상권'],
    timelineKey: 'haeundae-promenade',
    onlineSubmissionAvailable: false,
  },
  {
    id: 'dg-2026-001',
    sourceType: 'land-internet',
    sourceNoticeId: 'LEGACY-DG-2026-001',
    title: '범어동 지구단위계획 변경(안) 인터넷 주민의견청취',
    slug: 'daegu-suseong-beomeo-district-plan-2026',
    sourceUrl: 'https://www.suseong.kr/',
    organization: '대구광역시 수성구청',
    sido: '대구광역시',
    sigungu: '수성구',
    legalDong: '범어동',
    latitude: 35.8590,
    longitude: 128.6261,
    locationText: '대구광역시 수성구 범어동 일원',
    projectType: '지구단위계획',
    postedDate: '2026-03-08',
    hearingStartDate: '2026-03-09',
    hearingEndDate: '2026-03-24',
    status: 'ongoing',
    hearingType: '인터넷 주민의견청취',
    shortSummary: '범어동 생활권의 건축 기준과 가로 활성화 계획을 다루는 공고입니다.',
    aiSummary: '범어동 지구단위계획을 조정하는 공고입니다. 인근 거주자와 상가 이용자는 건축 기준, 공개공지, 가로활성화 계획이 어떻게 바뀌는지 확인할 필요가 있습니다. 이 공고는 온라인 의견제출 지원 여부를 원문에서 함께 확인해야 합니다.',
    impactSummary: '상업가로의 보행 환경, 건축 규모, 공개공지 기준에 영향을 줄 수 있습니다.',
    whyPublicReview: '지구단위계획은 생활권의 세부 건축 규칙을 정하기 때문에 주민 공개 절차가 필요합니다.',
    whoShouldCare: '범어동 거주자, 상가 운영자, 인근 토지 소유자',
    submissionMethod: '토지이음 인터넷 제출 또는 수성구청 공고문 기재 방식 확인',
    submissionPlace: '토지이음 및 수성구청 공고문 기준',
    submissionDeadlineText: '2026년 3월 24일 마감 예정, 온라인 제출 가능 여부는 원문 기준 확인 필요',
    contact: '대구광역시 수성구 도시디자인과',
    viewLocation: '수성구청 도시디자인과',
    attachments: [{ label: '수성구 공고문', url: 'https://www.suseong.kr/' }],
    rawSourceName: '수성구청 고시공고',
    rawText: '범어동 지구단위계획 변경(안) 인터넷 주민의견청취 요약',
    rawHtml: '<p>범어동 지구단위계획 변경(안) 인터넷 주민의견청취</p>',
    relatedNotices: [],
    relatedGosi: [],
    lastFetchedAt: '2026-03-10T00:00:00+09:00',
    lastVerifiedAt: '2026-03-11T09:05:00+09:00',
    locationConfidence: 0.82,
    impactTags: ['지구단위계획', '상권', '보행'],
    timelineKey: 'beomeo-district-plan',
    onlineSubmissionAvailable: true,
  },
  {
    id: 'gj-2026-001',
    sourceType: 'land-hearing',
    sourceNoticeId: 'LEGACY-GJ-2026-001',
    title: '첨단지구 공원·녹지 연결계획 결정(안) 주민공람',
    slug: 'gwangju-buk-gu-park-link-2026',
    sourceUrl: 'https://www.bukgu.gwangju.kr/',
    organization: '광주광역시 북구청',
    sido: '광주광역시',
    sigungu: '북구',
    legalDong: '오룡동',
    latitude: 35.2031,
    longitude: 126.8788,
    locationText: '광주광역시 북구 오룡동 첨단지구 일원',
    projectType: '공원·녹지',
    postedDate: '2026-03-02',
    hearingStartDate: '2026-03-03',
    hearingEndDate: '2026-03-17',
    status: 'ongoing',
    hearingType: '주민의견청취 공람',
    shortSummary: '공원과 녹지축 연결을 조정하는 주민공람입니다.',
    aiSummary: '첨단지구 공원과 녹지 연결 계획을 조정하는 공람입니다. 인근 거주자와 통학 가구는 보행 동선과 공원 접근 방식이 바뀌는지 확인할 필요가 있습니다. 제출처는 원문 공고문을 우선 확인해야 합니다.',
    impactSummary: '산책로, 공원 접근성, 생활권 녹지 연결성에 영향을 줄 수 있습니다.',
    whyPublicReview: '공원과 녹지 계획은 생활권의 이용 방식과 이동 동선에 직접 연결되기 때문입니다.',
    whoShouldCare: '첨단지구 거주자, 통학 가구, 생활권 공원 이용자',
    submissionMethod: '북구청 도시계획과 방문 또는 우편 접수',
    submissionPlace: '북구청 도시계획과',
    submissionDeadlineText: '2026년 3월 17일 마감 예정, 원문 기준 확인 필요',
    contact: '광주광역시 북구 도시계획과',
    viewLocation: '북구청 도시계획과',
    attachments: [{ label: '북구청 공고문', url: 'https://www.bukgu.gwangju.kr/' }],
    rawSourceName: '북구청 고시공고',
    rawText: '첨단지구 공원·녹지 연결계획 결정(안) 주민공람 요약',
    rawHtml: '<p>첨단지구 공원·녹지 연결계획 결정(안) 주민공람</p>',
    relatedNotices: [],
    relatedGosi: [],
    lastFetchedAt: '2026-03-10T00:00:00+09:00',
    lastVerifiedAt: '2026-03-11T09:10:00+09:00',
    locationConfidence: 0.79,
    impactTags: ['공원', '녹지', '보행'],
    timelineKey: 'gwangju-park-link',
    onlineSubmissionAvailable: false,
  },
  {
    id: 'dj-2026-001',
    sourceType: 'land-internet',
    sourceNoticeId: 'LEGACY-DJ-2026-001',
    title: '도룡동 연구개발특구 도로체계 조정(안) 인터넷 주민의견청취',
    slug: 'daejeon-yuseong-doryong-road-2026',
    sourceUrl: 'https://www.yuseong.go.kr/',
    organization: '대전광역시 유성구청',
    sido: '대전광역시',
    sigungu: '유성구',
    legalDong: '도룡동',
    latitude: 36.3768,
    longitude: 127.3865,
    locationText: '대전광역시 유성구 도룡동 연구개발특구 일원',
    projectType: '도로계획',
    postedDate: '2026-03-09',
    hearingStartDate: '2026-03-10',
    hearingEndDate: '2026-03-26',
    status: 'ongoing',
    hearingType: '인터넷 주민의견청취',
    shortSummary: '연구개발특구 도로 접속과 교차체계를 조정하는 공고입니다.',
    aiSummary: '도룡동 연구개발특구 일원의 도로체계를 조정하는 공고입니다. 인근 직장인과 거주자는 진출입 방향과 교차로 체계가 달라질 수 있는지 확인하는 것이 좋습니다. 온라인 제출 지원 여부는 원문 공고에서 다시 확인해야 합니다.',
    impactSummary: '출퇴근 교통 흐름, 보행자 이동, 연구단지 접근성에 영향을 줄 수 있습니다.',
    whyPublicReview: '도로체계 조정은 생활권 이동 패턴과 교통안전에 직접 영향을 주기 때문입니다.',
    whoShouldCare: '도룡동 거주자, 연구단지 근무자, 주변 통행 이용자',
    submissionMethod: '토지이음 인터넷 제출 또는 유성구청 공고문 기재 방식 확인',
    submissionPlace: '토지이음 및 유성구청 공고문 기준',
    submissionDeadlineText: '2026년 3월 26일 마감 예정, 온라인 제출 가능 여부는 원문 기준 확인 필요',
    contact: '대전광역시 유성구 도시계획과',
    viewLocation: '유성구청 도시계획과',
    attachments: [{ label: '유성구청 공고문', url: 'https://www.yuseong.go.kr/' }],
    rawSourceName: '유성구청 고시공고',
    rawText: '도룡동 연구개발특구 도로체계 조정(안) 인터넷 주민의견청취 요약',
    rawHtml: '<p>도룡동 연구개발특구 도로체계 조정(안) 인터넷 주민의견청취</p>',
    relatedNotices: [],
    relatedGosi: [],
    lastFetchedAt: '2026-03-10T00:00:00+09:00',
    lastVerifiedAt: '2026-03-11T09:15:00+09:00',
    locationConfidence: 0.8,
    impactTags: ['도로', '교통', '연구단지'],
    timelineKey: 'doryong-road-adjustment',
    onlineSubmissionAvailable: true,
  },
  {
    id: 'us-2026-001',
    sourceType: 'land-hearing',
    sourceNoticeId: 'LEGACY-US-2026-001',
    title: '삼산생활권 공원 재배치 계획(안) 주민공람',
    slug: 'ulsan-nam-gu-samsan-park-2026',
    sourceUrl: 'https://www.ulsannamgu.go.kr/',
    organization: '울산광역시 남구청',
    sido: '울산광역시',
    sigungu: '남구',
    legalDong: '삼산동',
    latitude: 35.5431,
    longitude: 129.3385,
    locationText: '울산광역시 남구 삼산동 일원',
    projectType: '공원·녹지',
    postedDate: '2026-03-01',
    hearingStartDate: '2026-03-02',
    hearingEndDate: '2026-03-14',
    status: 'ongoing',
    hearingType: '주민의견청취 공람',
    shortSummary: '생활권 공원 재배치와 이용 동선 조정을 다루는 공고입니다.',
    aiSummary: '삼산생활권 공원을 재배치하는 공람입니다. 인근 거주자와 상가 이용자는 공원 위치와 보행 접근 동선이 어떻게 달라지는지 살펴볼 필요가 있습니다. 실제 제출은 원문 공고의 절차를 따라야 합니다.',
    impactSummary: '생활권 휴식 공간, 보행 연결, 상가 전면 접근에 영향을 줄 수 있습니다.',
    whyPublicReview: '공원 재배치는 생활권의 체감 이용 방식과 편의에 직접 영향을 주기 때문입니다.',
    whoShouldCare: '삼산동 거주자, 공원 인접 상가 운영자, 어린이 동반 가구',
    submissionMethod: '남구청 도시창조과 방문 또는 우편 접수',
    submissionPlace: '남구청 도시창조과',
    submissionDeadlineText: '2026년 3월 14일 마감 예정, 원문 기준 확인 필요',
    contact: '울산광역시 남구 도시창조과',
    viewLocation: '남구청 도시창조과',
    attachments: [{ label: '남구청 공고문', url: 'https://www.ulsannamgu.go.kr/' }],
    rawSourceName: '남구청 고시공고',
    rawText: '삼산생활권 공원 재배치 계획(안) 주민공람 요약',
    rawHtml: '<p>삼산생활권 공원 재배치 계획(안) 주민공람</p>',
    relatedNotices: [],
    relatedGosi: [],
    lastFetchedAt: '2026-03-10T00:00:00+09:00',
    lastVerifiedAt: '2026-03-11T09:20:00+09:00',
    locationConfidence: 0.76,
    impactTags: ['공원', '생활권', '보행'],
    timelineKey: 'samsan-park-refresh',
    onlineSubmissionAvailable: false,
  },
  {
    id: 'sj-2026-001',
    sourceType: 'land-internet',
    sourceNoticeId: 'LEGACY-SJ-2026-001',
    title: '나성동 중심상업지구 지구단위계획 변경(안) 인터넷 주민의견청취',
    slug: 'sejong-naseong-district-plan-2026',
    sourceUrl: 'https://www.sejong.go.kr/',
    organization: '세종특별자치시청',
    sido: '세종특별자치시',
    sigungu: '세종특별자치시',
    legalDong: '나성동',
    latitude: 36.4894,
    longitude: 127.2577,
    locationText: '세종특별자치시 나성동 중심상업지구 일원',
    projectType: '지구단위계획',
    postedDate: '2026-03-07',
    hearingStartDate: '2026-03-08',
    hearingEndDate: '2026-03-23',
    status: 'ongoing',
    hearingType: '인터넷 주민의견청취',
    shortSummary: '상업지구 건축 기준과 공개공간 배치를 조정하는 공고입니다.',
    aiSummary: '나성동 중심상업지구의 지구단위계획을 조정하는 공고입니다. 거주자와 상가 이용자는 보행 공간과 건축 기준이 어떻게 달라질지 확인하는 것이 좋습니다. 온라인 제출 가능 여부는 원문 공고에서 다시 확인해야 합니다.',
    impactSummary: '상업가로의 보행 환경, 공개공지, 건축 규모에 영향을 줄 수 있습니다.',
    whyPublicReview: '상업지구 계획 조정은 생활권 이용 패턴과 개발 기준을 바꾸기 때문입니다.',
    whoShouldCare: '나성동 거주자, 상가 운영자, 생활권 보행 이용자',
    submissionMethod: '토지이음 인터넷 제출 또는 세종시청 공고문 기재 방식 확인',
    submissionPlace: '토지이음 및 세종시청 공고문 기준',
    submissionDeadlineText: '2026년 3월 23일 마감 예정, 온라인 제출 가능 여부는 원문 기준 확인 필요',
    contact: '세종특별자치시 도시계획과',
    viewLocation: '세종특별자치시청 도시계획과',
    attachments: [{ label: '세종시청 공고문', url: 'https://www.sejong.go.kr/' }],
    rawSourceName: '세종시청 고시공고',
    rawText: '나성동 중심상업지구 지구단위계획 변경(안) 인터넷 주민의견청취 요약',
    rawHtml: '<p>나성동 중심상업지구 지구단위계획 변경(안) 인터넷 주민의견청취</p>',
    relatedNotices: [],
    relatedGosi: [],
    lastFetchedAt: '2026-03-10T00:00:00+09:00',
    lastVerifiedAt: '2026-03-11T09:25:00+09:00',
    locationConfidence: 0.81,
    impactTags: ['상업지구', '지구단위계획', '보행'],
    timelineKey: 'naseong-district-plan',
    onlineSubmissionAvailable: true,
  },
  {
    id: 'gw-2026-001',
    sourceType: 'land-hearing',
    sourceNoticeId: 'LEGACY-GW-2026-001',
    title: '소양강변 수변공원 조성계획(안) 주민공람',
    slug: 'gangwon-chuncheon-river-park-2026',
    sourceUrl: 'https://www.chuncheon.go.kr/',
    organization: '강원특별자치도 춘천시청',
    sido: '강원특별자치도',
    sigungu: '춘천시',
    legalDong: '근화동',
    latitude: 37.8793,
    longitude: 127.7188,
    locationText: '강원특별자치도 춘천시 근화동 수변 일원',
    projectType: '공원·녹지',
    postedDate: '2026-03-06',
    hearingStartDate: '2026-03-07',
    hearingEndDate: '2026-03-19',
    status: 'ongoing',
    hearingType: '주민의견청취 공람',
    shortSummary: '수변공원 조성과 보행 연결을 다루는 주민공람입니다.',
    aiSummary: '소양강변 수변공원 조성 계획을 공개하는 공람입니다. 인근 거주자와 산책 이용자는 보행 연결, 휴게공간, 접근 방식이 바뀌는지 확인할 필요가 있습니다. 제출은 원문 공고문 절차를 따라야 합니다.',
    impactSummary: '수변 접근성, 산책 동선, 공원 이용 편의에 영향을 줄 수 있습니다.',
    whyPublicReview: '수변공원 계획은 생활권 이용 방식과 공공공간 체감에 직접 연결되기 때문입니다.',
    whoShouldCare: '근화동 거주자, 강변 산책 이용자, 인근 상가 운영자',
    submissionMethod: '춘천시 도시재생과 방문 또는 우편 접수',
    submissionPlace: '춘천시청 도시재생과',
    submissionDeadlineText: '2026년 3월 19일 마감 예정, 원문 기준 확인 필요',
    contact: '강원특별자치도 춘천시 도시재생과',
    viewLocation: '춘천시청 도시재생과',
    attachments: [{ label: '춘천시청 공고문', url: 'https://www.chuncheon.go.kr/' }],
    rawSourceName: '춘천시청 고시공고',
    rawText: '소양강변 수변공원 조성계획(안) 주민공람 요약',
    rawHtml: '<p>소양강변 수변공원 조성계획(안) 주민공람</p>',
    relatedNotices: [],
    relatedGosi: [],
    lastFetchedAt: '2026-03-10T00:00:00+09:00',
    lastVerifiedAt: '2026-03-11T09:30:00+09:00',
    locationConfidence: 0.77,
    impactTags: ['수변', '공원', '보행'],
    timelineKey: 'soyangg-river-park',
    onlineSubmissionAvailable: false,
  },
  {
    id: 'cb-2026-001',
    sourceType: 'land-hearing',
    sourceNoticeId: 'LEGACY-CB-2026-001',
    title: '오송역세권 광장 재편 계획(안) 주민공람',
    slug: 'chungbuk-cheongju-osong-plaza-2026',
    sourceUrl: 'https://www.cheongju.go.kr/',
    organization: '충청북도 청주시청',
    sido: '충청북도',
    sigungu: '청주시 흥덕구',
    legalDong: '오송읍',
    latitude: 36.6206,
    longitude: 127.3250,
    locationText: '충청북도 청주시 흥덕구 오송읍 일원',
    projectType: '역세권 계획',
    postedDate: '2026-03-04',
    hearingStartDate: '2026-03-05',
    hearingEndDate: '2026-03-16',
    status: 'ongoing',
    hearingType: '주민의견청취 공람',
    shortSummary: '오송역 주변 광장과 보행광장 재편 계획을 다루는 공고입니다.',
    aiSummary: '오송역세권 광장과 보행공간을 재편하는 계획입니다. 역 이용자와 인근 거주자는 보행 접근과 교통 환승 동선 변화 가능성을 확인하는 것이 좋습니다. 원문 공고를 기준으로 제출처를 다시 확인해야 합니다.',
    impactSummary: '역 접근성, 보행광장 이용, 환승 동선에 영향을 줄 수 있습니다.',
    whyPublicReview: '역세권 광장 재편은 보행 흐름과 생활권 이동 패턴을 바꾸기 때문입니다.',
    whoShouldCare: '오송읍 거주자, 역 이용자, 인근 상가 운영자',
    submissionMethod: '청주시 도시계획과 방문 제출 또는 우편 접수',
    submissionPlace: '청주시청 도시계획과',
    submissionDeadlineText: '2026년 3월 16일 마감 예정, 원문 기준 확인 필요',
    contact: '충청북도 청주시 도시계획과',
    viewLocation: '청주시청 도시계획과',
    attachments: [{ label: '청주시청 공고문', url: 'https://www.cheongju.go.kr/' }],
    rawSourceName: '청주시청 고시공고',
    rawText: '오송역세권 광장 재편 계획(안) 주민공람 요약',
    rawHtml: '<p>오송역세권 광장 재편 계획(안) 주민공람</p>',
    relatedNotices: [],
    relatedGosi: [],
    lastFetchedAt: '2026-03-10T00:00:00+09:00',
    lastVerifiedAt: '2026-03-11T09:35:00+09:00',
    locationConfidence: 0.77,
    impactTags: ['역세권', '광장', '보행'],
    timelineKey: 'osong-station-plaza',
    onlineSubmissionAvailable: false,
  },
  {
    id: 'cn-2026-001',
    sourceType: 'land-internet',
    sourceNoticeId: 'LEGACY-CN-2026-001',
    title: '불당생활권 도로·보행체계 조정(안) 인터넷 주민의견청취',
    slug: 'chungnam-cheonan-buldang-road-2026',
    sourceUrl: 'https://www.cheonan.go.kr/',
    organization: '충청남도 천안시청',
    sido: '충청남도',
    sigungu: '천안시 서북구',
    legalDong: '불당동',
    latitude: 36.8146,
    longitude: 127.1086,
    locationText: '충청남도 천안시 서북구 불당동 일원',
    projectType: '도로계획',
    postedDate: '2026-03-08',
    hearingStartDate: '2026-03-09',
    hearingEndDate: '2026-03-21',
    status: 'ongoing',
    hearingType: '인터넷 주민의견청취',
    shortSummary: '생활권 도로와 보행 연결을 함께 조정하는 공고입니다.',
    aiSummary: '불당생활권의 도로와 보행체계를 조정하는 공고입니다. 인근 거주자와 통학 가구는 차량 진출입과 보행 동선이 어떻게 달라지는지 확인할 필요가 있습니다. 온라인 제출 가능 여부는 원문에서 다시 확인해야 합니다.',
    impactSummary: '생활권 교통 흐름, 통학 동선, 보행 안전에 영향을 줄 수 있습니다.',
    whyPublicReview: '도로와 보행체계 조정은 생활권의 일상 이동 방식에 직접 영향을 주기 때문입니다.',
    whoShouldCare: '불당동 거주자, 통학 가구, 차량 통행이 많은 주민',
    submissionMethod: '토지이음 인터넷 제출 또는 천안시청 공고문 기재 방식 확인',
    submissionPlace: '토지이음 및 천안시청 공고문 기준',
    submissionDeadlineText: '2026년 3월 21일 마감 예정, 온라인 제출 가능 여부는 원문 기준 확인 필요',
    contact: '충청남도 천안시 도시계획과',
    viewLocation: '천안시청 도시계획과',
    attachments: [{ label: '천안시청 공고문', url: 'https://www.cheonan.go.kr/' }],
    rawSourceName: '천안시청 고시공고',
    rawText: '불당생활권 도로·보행체계 조정(안) 인터넷 주민의견청취 요약',
    rawHtml: '<p>불당생활권 도로·보행체계 조정(안) 인터넷 주민의견청취</p>',
    relatedNotices: [],
    relatedGosi: [],
    lastFetchedAt: '2026-03-10T00:00:00+09:00',
    lastVerifiedAt: '2026-03-11T09:40:00+09:00',
    locationConfidence: 0.79,
    impactTags: ['도로', '보행', '통학'],
    timelineKey: 'buldang-road-system',
    onlineSubmissionAvailable: true,
  },
  {
    id: 'jb-2026-001',
    sourceType: 'land-hearing',
    sourceNoticeId: 'LEGACY-JB-2026-001',
    title: '객사길 일대 보행특화구역 지정(안) 주민공람',
    slug: 'jeonbuk-jeonju-gaeksa-walk-2026',
    sourceUrl: 'https://www.jeonju.go.kr/',
    organization: '전북특별자치도 전주시청',
    sido: '전북특별자치도',
    sigungu: '전주시 완산구',
    legalDong: '고사동',
    latitude: 35.8167,
    longitude: 127.1468,
    locationText: '전북특별자치도 전주시 완산구 고사동 일원',
    projectType: '보행특화구역',
    postedDate: '2026-03-03',
    hearingStartDate: '2026-03-04',
    hearingEndDate: '2026-03-12',
    status: 'closing-soon',
    hearingType: '주민의견청취 공람',
    shortSummary: '객사길 상권 일대 보행특화구역 지정과 가로 운영 기준을 다루는 공고입니다.',
    aiSummary: '객사길 일대 보행특화구역을 지정하는 공고입니다. 상가 운영자와 보행 이용자는 차량 통행 제한과 가로 운영 방식이 바뀌는지 확인할 필요가 있습니다. 실제 제출처는 원문 공고를 다시 확인해야 합니다.',
    impactSummary: '차량 통행 방식, 상권 앞 보행 환경, 이벤트 운영 기준에 영향을 줄 수 있습니다.',
    whyPublicReview: '보행특화구역 지정은 생활권과 상권 이용 패턴을 직접 바꾸기 때문입니다.',
    whoShouldCare: '고사동 상가 운영자, 전주 중심가 이용자, 인근 거주자',
    submissionMethod: '전주시 도시재생과 방문 또는 우편 접수',
    submissionPlace: '전주시청 도시재생과',
    submissionDeadlineText: '2026년 3월 12일 마감 예정, 당일 접수 시간은 원문 기준 확인 필요',
    contact: '전북특별자치도 전주시 도시재생과',
    viewLocation: '전주시청 도시재생과',
    attachments: [{ label: '전주시청 공고문', url: 'https://www.jeonju.go.kr/' }],
    rawSourceName: '전주시청 고시공고',
    rawText: '객사길 일대 보행특화구역 지정(안) 주민공람 요약',
    rawHtml: '<p>객사길 일대 보행특화구역 지정(안) 주민공람</p>',
    relatedNotices: [],
    relatedGosi: [],
    lastFetchedAt: '2026-03-10T00:00:00+09:00',
    lastVerifiedAt: '2026-03-11T09:45:00+09:00',
    locationConfidence: 0.78,
    impactTags: ['보행특화', '상권', '교통'],
    timelineKey: 'gaeksa-walk-zone',
    onlineSubmissionAvailable: false,
  },
  {
    id: 'jn-2026-001',
    sourceType: 'land-hearing',
    sourceNoticeId: 'LEGACY-JN-2026-001',
    title: '오천지구 수변경관 정비계획(안) 주민공람',
    slug: 'jeonnam-suncheon-riverfront-2026',
    sourceUrl: 'https://www.suncheon.go.kr/',
    organization: '전라남도 순천시청',
    sido: '전라남도',
    sigungu: '순천시',
    legalDong: '오천동',
    latitude: 34.9367,
    longitude: 127.5141,
    locationText: '전라남도 순천시 오천동 일원',
    projectType: '경관계획',
    postedDate: '2026-03-05',
    hearingStartDate: '2026-03-06',
    hearingEndDate: '2026-03-18',
    status: 'ongoing',
    hearingType: '주민의견청취 공람',
    shortSummary: '수변경관과 공공공간 운영 기준을 조정하는 공람입니다.',
    aiSummary: '오천지구 수변경관 정비계획을 공개하는 공람입니다. 인근 거주자와 공원 이용자는 수변 공간 이용 방식과 공공공간 정비 범위를 확인하는 것이 좋습니다. 제출처는 원문 공고문이 우선입니다.',
    impactSummary: '수변 공간 이용, 경관 정비, 생활권 공공공간 체감에 영향을 줄 수 있습니다.',
    whyPublicReview: '경관 정비는 생활권 공공공간의 이용 방식과 체감 변화에 직접 연결되기 때문입니다.',
    whoShouldCare: '오천동 거주자, 수변공원 이용자, 인근 상가 운영자',
    submissionMethod: '순천시 도시공간과 방문 또는 우편 접수',
    submissionPlace: '순천시청 도시공간과',
    submissionDeadlineText: '2026년 3월 18일 마감 예정, 원문 기준 확인 필요',
    contact: '전라남도 순천시 도시공간과',
    viewLocation: '순천시청 도시공간과',
    attachments: [{ label: '순천시청 공고문', url: 'https://www.suncheon.go.kr/' }],
    rawSourceName: '순천시청 고시공고',
    rawText: '오천지구 수변경관 정비계획(안) 주민공람 요약',
    rawHtml: '<p>오천지구 수변경관 정비계획(안) 주민공람</p>',
    relatedNotices: [],
    relatedGosi: [],
    lastFetchedAt: '2026-03-10T00:00:00+09:00',
    lastVerifiedAt: '2026-03-11T09:50:00+09:00',
    locationConfidence: 0.76,
    impactTags: ['경관', '수변', '공공공간'],
    timelineKey: 'suncheon-riverfront-plan',
    onlineSubmissionAvailable: false,
  },
  {
    id: 'gb-2026-001',
    sourceType: 'land-internet',
    sourceNoticeId: 'LEGACY-GB-2026-001',
    title: '오천지구 연결도로 선형 조정(안) 인터넷 주민의견청취',
    slug: 'gyeongbuk-pohang-road-line-2026',
    sourceUrl: 'https://www.pohang.go.kr/',
    organization: '경상북도 포항시청',
    sido: '경상북도',
    sigungu: '포항시 남구',
    legalDong: '오천읍',
    latitude: 35.9688,
    longitude: 129.4116,
    locationText: '경상북도 포항시 남구 오천읍 일원',
    projectType: '도로계획',
    postedDate: '2026-03-06',
    hearingStartDate: '2026-03-07',
    hearingEndDate: '2026-03-22',
    status: 'ongoing',
    hearingType: '인터넷 주민의견청취',
    shortSummary: '연결도로 선형과 접속부 조정안을 확인하는 공고입니다.',
    aiSummary: '오천지구 연결도로 선형을 조정하는 공고입니다. 인근 거주자와 통근자는 도로가 어디로 지나가고 접속 방식이 달라지는지 확인할 필요가 있습니다. 온라인 제출 가능 여부는 원문 공고를 다시 봐야 합니다.',
    impactSummary: '교통량, 차량 진출입, 통근 동선에 영향을 줄 수 있습니다.',
    whyPublicReview: '도로 선형 조정은 생활권 이동과 교통안전에 직접 영향을 주기 때문입니다.',
    whoShouldCare: '오천읍 거주자, 통근자, 인접 토지 소유자',
    submissionMethod: '토지이음 인터넷 제출 또는 포항시청 공고문 기재 방식 확인',
    submissionPlace: '토지이음 및 포항시청 공고문 기준',
    submissionDeadlineText: '2026년 3월 22일 마감 예정, 온라인 제출 가능 여부는 원문 기준 확인 필요',
    contact: '경상북도 포항시 도시계획과',
    viewLocation: '포항시청 도시계획과',
    attachments: [{ label: '포항시청 공고문', url: 'https://www.pohang.go.kr/' }],
    rawSourceName: '포항시청 고시공고',
    rawText: '오천지구 연결도로 선형 조정(안) 인터넷 주민의견청취 요약',
    rawHtml: '<p>오천지구 연결도로 선형 조정(안) 인터넷 주민의견청취</p>',
    relatedNotices: [],
    relatedGosi: [],
    lastFetchedAt: '2026-03-10T00:00:00+09:00',
    lastVerifiedAt: '2026-03-11T09:55:00+09:00',
    locationConfidence: 0.77,
    impactTags: ['도로', '교통', '통근'],
    timelineKey: 'ocheon-road-line',
    onlineSubmissionAvailable: true,
  },
  {
    id: 'gn-2026-001',
    sourceType: 'land-hearing',
    sourceNoticeId: 'LEGACY-GN-2026-001',
    title: '상남생활권 공개공지 정비계획(안) 주민공람',
    slug: 'gyeongnam-changwon-public-space-2026',
    sourceUrl: 'https://www.changwon.go.kr/',
    organization: '경상남도 창원시청',
    sido: '경상남도',
    sigungu: '창원시 성산구',
    legalDong: '상남동',
    latitude: 35.2220,
    longitude: 128.6917,
    locationText: '경상남도 창원시 성산구 상남동 일원',
    projectType: '공개공지 정비',
    postedDate: '2026-03-04',
    hearingStartDate: '2026-03-05',
    hearingEndDate: '2026-03-13',
    status: 'closing-soon',
    hearingType: '주민의견청취 공람',
    shortSummary: '상남생활권 공개공지와 보행 연결 기준을 조정하는 공람입니다.',
    aiSummary: '상남생활권 공개공지 정비계획을 공개하는 공람입니다. 인근 거주자와 상가 이용자는 공개공간 활용 방식과 보행 연결 변화 가능성을 확인하는 것이 좋습니다. 실제 제출은 원문 공고문 절차를 따라야 합니다.',
    impactSummary: '공개공간 이용, 상가 전면 보행, 생활권 휴식공간 체감에 영향을 줄 수 있습니다.',
    whyPublicReview: '공개공지 운영 기준이 달라지면 생활권의 공공공간 이용 방식이 바뀌기 때문입니다.',
    whoShouldCare: '상남동 거주자, 상가 운영자, 생활권 보행 이용자',
    submissionMethod: '창원시 도시정책과 방문 또는 우편 접수',
    submissionPlace: '창원시청 도시정책과',
    submissionDeadlineText: '2026년 3월 13일 마감 예정, 당일 접수 시간은 원문 기준 확인 필요',
    contact: '경상남도 창원시 도시정책과',
    viewLocation: '창원시청 도시정책과',
    attachments: [{ label: '창원시청 공고문', url: 'https://www.changwon.go.kr/' }],
    rawSourceName: '창원시청 고시공고',
    rawText: '상남생활권 공개공지 정비계획(안) 주민공람 요약',
    rawHtml: '<p>상남생활권 공개공지 정비계획(안) 주민공람</p>',
    relatedNotices: [],
    relatedGosi: [],
    lastFetchedAt: '2026-03-10T00:00:00+09:00',
    lastVerifiedAt: '2026-03-11T10:00:00+09:00',
    locationConfidence: 0.76,
    impactTags: ['공개공지', '보행', '상권'],
    timelineKey: 'sangnam-public-space',
    onlineSubmissionAvailable: false,
  },
  {
    id: 'jj-2026-001',
    sourceType: 'land-hearing',
    sourceNoticeId: 'LEGACY-JJ-2026-001',
    title: '노형지구 공원·도로 연계계획(안) 주민공람',
    slug: 'jeju-jeju-city-nohyeong-link-2026',
    sourceUrl: 'https://www.jejusi.go.kr/',
    organization: '제주특별자치도 제주시청',
    sido: '제주특별자치도',
    sigungu: '제주시',
    legalDong: '노형동',
    latitude: 33.4848,
    longitude: 126.4766,
    locationText: '제주특별자치도 제주시 노형동 일원',
    projectType: '공원·도로 연계',
    postedDate: '2026-03-02',
    hearingStartDate: '2026-03-03',
    hearingEndDate: '2026-03-18',
    status: 'ongoing',
    hearingType: '주민의견청취 공람',
    shortSummary: '공원 접근도로와 생활권 보행 연결을 함께 보는 공람입니다.',
    aiSummary: '노형지구 공원 접근도로와 보행 연결 계획을 조정하는 공람입니다. 인근 거주자와 차량 이용자는 공원 진입과 생활권 이동 방식이 달라질 수 있는지 확인하는 것이 좋습니다. 제출처는 원문 공고문 기준으로 다시 봐야 합니다.',
    impactSummary: '공원 접근성, 차량 진출입, 생활권 보행 연결에 영향을 줄 수 있습니다.',
    whyPublicReview: '공원 접근도로와 보행 연결 변경은 생활권 이동과 이용 편의에 직접 연결되기 때문입니다.',
    whoShouldCare: '노형동 거주자, 공원 이용자, 인근 상가 운영자',
    submissionMethod: '제주시 도시계획과 방문 또는 우편 접수',
    submissionPlace: '제주시청 도시계획과',
    submissionDeadlineText: '2026년 3월 18일 마감 예정, 원문 기준 확인 필요',
    contact: '제주특별자치도 제주시 도시계획과',
    viewLocation: '제주시청 도시계획과',
    attachments: [{ label: '제주시청 공고문', url: 'https://www.jejusi.go.kr/' }],
    rawSourceName: '제주시청 고시공고',
    rawText: '노형지구 공원·도로 연계계획(안) 주민공람 요약',
    rawHtml: '<p>노형지구 공원·도로 연계계획(안) 주민공람</p>',
    relatedNotices: [],
    relatedGosi: [],
    lastFetchedAt: '2026-03-10T00:00:00+09:00',
    lastVerifiedAt: '2026-03-11T10:05:00+09:00',
    locationConfidence: 0.76,
    impactTags: ['공원', '도로', '보행'],
    timelineKey: 'nohyeong-park-link',
    onlineSubmissionAvailable: false,
  },
];

const sigunguByKey = new Map(sigunguCatalog.map((item) => [`${item.sido}::${item.sigungu}`, item]));

function readJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, filename), 'utf8'));
}

function writeJson(filename, value) {
  fs.writeFileSync(path.join(dataDir, filename), `${JSON.stringify(value, null, 2)}\n`);
}

function isUsableUrl(value = '') {
  try {
    new URL(String(value));
    return true;
  } catch {
    return false;
  }
}

function isEumUrl(value = '') {
  return isUsableUrl(value) && new URL(String(value)).hostname.toLowerCase().includes('eum.go.kr');
}

function isEumNotice(notice = {}) {
  const sourceType = String(notice.sourceType || '').toLowerCase();
  if (sourceType === 'hr' || sourceType === 'ih') return true;
  return [notice.sourceDetailUrl, notice.sourceUrl, notice.eumDirectUrl].some((value) => isEumUrl(value));
}

function getEumKind(notice = {}) {
  const sourceUrl = notice.sourceDetailUrl || notice.sourceUrl || '';
  const sourceType = String(notice.sourceType || '').toLowerCase();
  const pathname = isUsableUrl(sourceUrl) ? new URL(String(sourceUrl)).pathname.toLowerCase() : '';

  if (
    pathname.includes('/ih/')
    || pathname.includes('ihhearing')
    || sourceType === 'ih'
  ) {
    return 'ih';
  }

  if (
    pathname.includes('/hr/')
    || pathname.includes('hrpeoplehear')
    || sourceType === 'hr'
  ) {
    return 'hr';
  }

  if (isEumNotice(notice)) {
    if (sourceType.includes('internet') || sourceType.includes('land-internet')) return 'ih';
    if (sourceType.includes('land-hearing')) return 'hr';
  }

  return '';
}

function extractEumIdentifiers(...values) {
  const result = { seq: '', pnncCd: '' };

  values.forEach((value) => {
    if (!isUsableUrl(value)) return;
    const url = new URL(String(value));
    if (!result.seq) result.seq = (url.searchParams.get('seq') || '').trim();
    if (!result.pnncCd) result.pnncCd = (url.searchParams.get('pnnc_cd') || url.searchParams.get('pnncCd') || '').trim();
  });

  return result;
}

function buildEumDetailUrl(notice = {}) {
  const sourceUrl = notice.sourceDetailUrl || notice.sourceUrl || '';
  const kind = getEumKind(notice);
  const identifiers = extractEumIdentifiers(notice.eumDirectUrl, notice.sourceDetailUrl, notice.sourceUrl);
  const seq = String(notice.seq || identifiers.seq || '').trim();
  const pnncCd = String(notice.pnncCd || notice.pnnc_cd || identifiers.pnncCd || '').trim();

  if (isEumUrl(notice.sourceDetailUrl) && /\/(ih\/ihHearingDet|hr\/hrPeopleHearDet)\.jsp$/i.test(new URL(String(notice.sourceDetailUrl)).pathname)) {
    return notice.sourceDetailUrl;
  }
  if (isEumUrl(notice.eumDirectUrl) && /\/(ih\/ihHearingDet|hr\/hrPeopleHearDet)\.jsp$/i.test(new URL(String(notice.eumDirectUrl)).pathname)) {
    return notice.eumDirectUrl;
  }
  if (kind === 'hr' && seq) {
    return `https://www.eum.go.kr/web/cp/hr/hrPeopleHearDet.jsp?seq=${encodeURIComponent(seq)}`;
  }
  if (kind === 'ih' && pnncCd) {
    return `https://www.eum.go.kr/web/cp/ih/ihHearingDet.jsp?pnnc_cd=${encodeURIComponent(pnncCd)}`;
  }
  return '';
}

function decorateNotice(notice) {
  const regionKey = `${notice.sido}::${notice.sigungu}`;
  const region = sigunguByKey.get(regionKey);
  const onlineSubmissionAvailable = typeof notice.onlineSubmissionAvailable === 'boolean'
    ? notice.onlineSubmissionAvailable
    : notice.hearingType?.includes('인터넷') || notice.sourceType === 'land-internet';
  const attachmentUrls = Array.isArray(notice.attachments)
    ? notice.attachments.map((item) => item.url).filter(Boolean)
    : [];
  const eumIdentifiers = extractEumIdentifiers(notice.sourceDetailUrl, notice.sourceUrl, notice.eumDirectUrl);
  const seq = String(notice.seq || eumIdentifiers.seq || '').trim();
  const pnncCd = String(notice.pnncCd || notice.pnnc_cd || eumIdentifiers.pnncCd || '').trim();
  const eumDirectUrl = buildEumDetailUrl({
    ...notice,
    seq,
    pnncCd,
  });

  return {
    ...notice,
    adminCode: notice.adminCode || region?.adminCode || '',
    onlineSubmissionAvailable,
    seq,
    pnncCd,
    sourceDetailUrl: notice.sourceDetailUrl || notice.sourceUrl || '',
    eumDirectUrl: notice.eumDirectUrl || eumDirectUrl || '',
    officialNoticeUrl: notice.officialNoticeUrl || '',
    attachmentUrls,
    hasOfficialNotice: Boolean(notice.officialNoticeUrl),
    hasAttachment: attachmentUrls.length > 0,
    linkVerifiedAt: notice.linkVerifiedAt || notice.lastVerifiedAt,
  };
}

const currentNotices = readJson('notices.json');
const mergedNotices = [
  ...currentNotices.map(decorateNotice),
  ...nationalNoticeSeeds.map(decorateNotice).filter((seed) => !currentNotices.some((item) => item.id === seed.id)),
].sort((a, b) => new Date(b.hearingEndDate) - new Date(a.hearingEndDate));

const regions = sidoCatalog.map((sido) => {
  const districts = sigunguCatalog
    .filter((item) => item.sido === sido.sido)
    .sort((a, b) => a.sigungu.localeCompare(b.sigungu, 'ko'))
    .map((district) => ({
      sigungu: district.sigungu,
      adminCode: district.adminCode,
      aliases: district.aliases,
      center: {
        lat: district.centerLat,
        lng: district.centerLng,
      },
    }));

  return {
    area: sido.area,
    name: sido.sido,
    shortName: sido.shortName,
    adminCode: sido.adminCode,
    center: {
      lat: sido.centerLat,
      lng: sido.centerLng,
    },
    description: `${sido.sido} 시군구 기준으로 진행 중인 주민공람공고를 확인할 수 있습니다.`,
    aliases: sido.aliases,
    focus: sido.focus,
    defaultZoom: sido.defaultZoom,
    districts,
  };
});

const sidoJson = sidoCatalog.map((item) => ({
  sido: item.sido,
  shortName: item.shortName,
  area: item.area,
  adminCode: item.adminCode,
  centerLat: item.centerLat,
  centerLng: item.centerLng,
  aliases: item.aliases,
}));

const sigunguJson = sigunguCatalog.map((item) => ({
  sido: item.sido,
  sigungu: item.sigungu,
  adminCode: item.adminCode,
  centerLat: item.centerLat,
  centerLng: item.centerLng,
  aliases: item.aliases,
}));

writeJson('notices.json', mergedNotices);
writeJson('regions.json', regions);
writeJson('sido.json', sidoJson);
writeJson('sigungu.json', sigunguJson);

console.log(`Updated notices: ${mergedNotices.length}`);
console.log(`Updated regions: ${regions.length}`);
