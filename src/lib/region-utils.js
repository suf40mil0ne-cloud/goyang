/**
 * src/lib/region-utils.js
 * GPS 역지오코딩 주소 → 시군구 매핑 유틸리티
 */

import {
  findHearingRegionFieldsByText,
  getCityHierarchyByName,
  getRegionHierarchyByRegion,
} from '../../shared/region-codes';

const REGION_DATA = [
  { name: '서울특별시', area: 'seoul', districts: [
    { sigungu: '종로구' }, { sigungu: '중구' }, { sigungu: '용산구' },
    { sigungu: '성동구' }, { sigungu: '광진구' }, { sigungu: '동대문구' },
    { sigungu: '중랑구' }, { sigungu: '성북구' }, { sigungu: '강북구' },
    { sigungu: '도봉구' }, { sigungu: '노원구' }, { sigungu: '은평구' },
    { sigungu: '서대문구' }, { sigungu: '마포구' }, { sigungu: '양천구' },
    { sigungu: '강서구' }, { sigungu: '구로구' }, { sigungu: '금천구' },
    { sigungu: '영등포구' }, { sigungu: '동작구' }, { sigungu: '관악구' },
    { sigungu: '서초구' }, { sigungu: '강남구' }, { sigungu: '송파구' },
    { sigungu: '강동구' },
  ]},
  { name: '부산광역시', area: 'busan', districts: [
    { sigungu: '중구' }, { sigungu: '서구' }, { sigungu: '동구' },
    { sigungu: '영도구' }, { sigungu: '부산진구' }, { sigungu: '동래구' },
    { sigungu: '남구' }, { sigungu: '북구' }, { sigungu: '해운대구' },
    { sigungu: '사하구' }, { sigungu: '금정구' }, { sigungu: '강서구' },
    { sigungu: '연제구' }, { sigungu: '수영구' }, { sigungu: '사상구' },
    { sigungu: '기장군' },
  ]},
  { name: '대구광역시', area: 'daegu', districts: [
    { sigungu: '중구' }, { sigungu: '동구' }, { sigungu: '서구' },
    { sigungu: '남구' }, { sigungu: '북구' }, { sigungu: '수성구' },
    { sigungu: '달서구' }, { sigungu: '달성군' }, { sigungu: '군위군' },
  ]},
  { name: '인천광역시', area: 'incheon', districts: [
    { sigungu: '중구' }, { sigungu: '동구' }, { sigungu: '미추홀구' },
    { sigungu: '연수구' }, { sigungu: '남동구' }, { sigungu: '부평구' },
    { sigungu: '계양구' }, { sigungu: '서구' }, { sigungu: '강화군' },
    { sigungu: '옹진군' },
  ]},
  { name: '광주광역시', area: 'gwangju', districts: [
    { sigungu: '동구' }, { sigungu: '서구' }, { sigungu: '남구' },
    { sigungu: '북구' }, { sigungu: '광산구' },
  ]},
  { name: '대전광역시', area: 'daejeon', districts: [
    { sigungu: '동구' }, { sigungu: '중구' }, { sigungu: '서구' },
    { sigungu: '유성구' }, { sigungu: '대덕구' },
  ]},
  { name: '울산광역시', area: 'ulsan', districts: [
    { sigungu: '중구' }, { sigungu: '남구' }, { sigungu: '동구' },
    { sigungu: '북구' }, { sigungu: '울주군' },
  ]},
  { name: '세종특별자치시', area: 'sejong', districts: [
    { sigungu: '세종특별자치시' },
  ]},
  { name: '경기도', area: 'gyeonggi', districts: [
    { sigungu: '수원시 장안구' }, { sigungu: '수원시 권선구' }, { sigungu: '수원시 팔달구' }, { sigungu: '수원시 영통구' },
    { sigungu: '성남시 수정구' }, { sigungu: '성남시 중원구' }, { sigungu: '성남시 분당구' },
    { sigungu: '의정부시' }, { sigungu: '안양시 만안구' }, { sigungu: '안양시 동안구' },
    { sigungu: '부천시' }, { sigungu: '광명시' }, { sigungu: '평택시' },
    { sigungu: '동두천시' }, { sigungu: '안산시 상록구' }, { sigungu: '안산시 단원구' },
    { sigungu: '고양시 덕양구' }, { sigungu: '고양시 일산동구' }, { sigungu: '고양시 일산서구' },
    { sigungu: '과천시' }, { sigungu: '구리시' }, { sigungu: '남양주시' },
    { sigungu: '오산시' }, { sigungu: '시흥시' }, { sigungu: '군포시' },
    { sigungu: '의왕시' }, { sigungu: '하남시' }, { sigungu: '용인시 처인구' },
    { sigungu: '용인시 기흥구' }, { sigungu: '용인시 수지구' }, { sigungu: '파주시' },
    { sigungu: '이천시' }, { sigungu: '안성시' }, { sigungu: '김포시' },
    { sigungu: '화성시' }, { sigungu: '광주시' }, { sigungu: '양주시' },
    { sigungu: '포천시' }, { sigungu: '여주시' }, { sigungu: '연천군' },
    { sigungu: '가평군' }, { sigungu: '양평군' },
  ]},
  { name: '강원특별자치도', area: 'gangwon', districts: [
    { sigungu: '춘천시' }, { sigungu: '원주시' }, { sigungu: '강릉시' },
    { sigungu: '동해시' }, { sigungu: '태백시' }, { sigungu: '속초시' },
    { sigungu: '삼척시' }, { sigungu: '홍천군' }, { sigungu: '횡성군' },
    { sigungu: '영월군' }, { sigungu: '평창군' }, { sigungu: '정선군' },
    { sigungu: '철원군' }, { sigungu: '화천군' }, { sigungu: '양구군' },
    { sigungu: '인제군' }, { sigungu: '고성군' }, { sigungu: '양양군' },
  ]},
  { name: '충청북도', area: 'chungbuk', districts: [
    { sigungu: '청주시 상당구' }, { sigungu: '청주시 서원구' }, { sigungu: '청주시 흥덕구' }, { sigungu: '청주시 청원구' },
    { sigungu: '충주시' }, { sigungu: '제천시' }, { sigungu: '보은군' },
    { sigungu: '옥천군' }, { sigungu: '영동군' }, { sigungu: '증평군' },
    { sigungu: '진천군' }, { sigungu: '괴산군' }, { sigungu: '음성군' },
    { sigungu: '단양군' },
  ]},
  { name: '충청남도', area: 'chungnam', districts: [
    { sigungu: '천안시 동남구' }, { sigungu: '천안시 서북구' }, { sigungu: '공주시' },
    { sigungu: '보령시' }, { sigungu: '아산시' }, { sigungu: '서산시' },
    { sigungu: '논산시' }, { sigungu: '계룡시' }, { sigungu: '당진시' },
    { sigungu: '금산군' }, { sigungu: '부여군' }, { sigungu: '서천군' },
    { sigungu: '청양군' }, { sigungu: '홍성군' }, { sigungu: '예산군' },
    { sigungu: '태안군' },
  ]},
  { name: '전북특별자치도', area: 'jeonbuk', districts: [
    { sigungu: '전주시 완산구' }, { sigungu: '전주시 덕진구' }, { sigungu: '군산시' },
    { sigungu: '익산시' }, { sigungu: '정읍시' }, { sigungu: '남원시' },
    { sigungu: '김제시' }, { sigungu: '완주군' }, { sigungu: '진안군' },
    { sigungu: '무주군' }, { sigungu: '장수군' }, { sigungu: '임실군' },
    { sigungu: '순창군' }, { sigungu: '고창군' }, { sigungu: '부안군' },
  ]},
  { name: '전라남도', area: 'jeonnam', districts: [
    { sigungu: '목포시' }, { sigungu: '여수시' }, { sigungu: '순천시' },
    { sigungu: '나주시' }, { sigungu: '광양시' }, { sigungu: '담양군' },
    { sigungu: '곡성군' }, { sigungu: '구례군' }, { sigungu: '고흥군' },
    { sigungu: '보성군' }, { sigungu: '화순군' }, { sigungu: '장흥군' },
    { sigungu: '강진군' }, { sigungu: '해남군' }, { sigungu: '영암군' },
    { sigungu: '무안군' }, { sigungu: '함평군' }, { sigungu: '영광군' },
    { sigungu: '장성군' }, { sigungu: '완도군' }, { sigungu: '진도군' },
    { sigungu: '신안군' },
  ]},
  { name: '경상북도', area: 'gyeongbuk', districts: [
    { sigungu: '포항시 남구' }, { sigungu: '포항시 북구' }, { sigungu: '경주시' },
    { sigungu: '김천시' }, { sigungu: '안동시' }, { sigungu: '구미시' },
    { sigungu: '영주시' }, { sigungu: '영천시' }, { sigungu: '상주시' },
    { sigungu: '문경시' }, { sigungu: '경산시' }, { sigungu: '의성군' },
    { sigungu: '청송군' }, { sigungu: '영양군' }, { sigungu: '영덕군' },
    { sigungu: '청도군' }, { sigungu: '고령군' }, { sigungu: '성주군' },
    { sigungu: '칠곡군' }, { sigungu: '예천군' }, { sigungu: '봉화군' },
    { sigungu: '울진군' }, { sigungu: '울릉군' },
  ]},
  { name: '경상남도', area: 'gyeongnam', districts: [
    { sigungu: '창원시 의창구' }, { sigungu: '창원시 성산구' }, { sigungu: '창원시 마산합포구' },
    { sigungu: '창원시 마산회원구' }, { sigungu: '창원시 진해구' }, { sigungu: '진주시' },
    { sigungu: '통영시' }, { sigungu: '사천시' }, { sigungu: '김해시' },
    { sigungu: '밀양시' }, { sigungu: '거제시' }, { sigungu: '양산시' },
    { sigungu: '의령군' }, { sigungu: '함안군' }, { sigungu: '창녕군' },
    { sigungu: '고성군' }, { sigungu: '남해군' }, { sigungu: '하동군' },
    { sigungu: '산청군' }, { sigungu: '함양군' }, { sigungu: '거창군' },
    { sigungu: '합천군' },
  ]},
  { name: '제주특별자치도', area: 'jeju', districts: [
    { sigungu: '제주시' }, { sigungu: '서귀포시' },
  ]},
];

export function getRegions() {
  return REGION_DATA;
}

export function getDistrictsForSido(sido) {
  const region = REGION_DATA.find((r) => r.name === sido);
  return region?.districts || [];
}

export function formatRegionLabel(region) {
  if (!region) return '';
  const { sido, sigungu } = region;
  if (!sigungu || sigungu === sido) return sido || '';
  return `${sido} ${sigungu}`.trim();
}

export function matchRegionFromAddress(address) {
  if (!address) return null;

  const state = String(address.state || '').trim();
  const city = String(address.city || '').trim();
  const borough = String(address.borough || '').trim();
  const cityDistrict = String(address.city_district || '').trim();
  const county = String(address.county || '').trim();
  const suburb = String(address.suburb || '').trim();

  console.info('[region-utils] matchRegionFromAddress input', {
    state, city, borough, cityDistrict, county, suburb,
  });

  // ── 전략 1: state + "city borough" 조합 (고양시 일산서구 처리 핵심) ──────
  // Nominatim이 city="고양시", borough="일산서구"로 분리해서 줄 때
  // → "고양시 일산서구"로 합쳐서 매칭
  if (state && city && borough) {
    const combined = `${city} ${borough}`;
    const match = getRegionHierarchyByRegion(state, combined);
    if (match) {
      console.info('[region-utils] matched via state + city+borough combined', { state, combined });
      return match;
    }
  }

  // ── 전략 2: state + borough/city_district 단독 매칭 ──────────────────────
  // 광역시 구 처럼 city 없이 borough만 오는 경우
  // 예: state="인천광역시", borough="부평구"
  for (const district of [borough, cityDistrict].filter(Boolean)) {
    if (state) {
      const match = getRegionHierarchyByRegion(state, district);
      if (match) {
        console.info('[region-utils] matched via state+district', { state, district });
        return match;
      }
    }
  }

  // ── 전략 3: state + city 시 단위 매칭 ────────────────────────────────────
  if (state && city) {
    const match = getRegionHierarchyByRegion(state, city)
      || getCityHierarchyByName(state, city, 'city-only');
    if (match) {
      console.info('[region-utils] matched via state+city', { state, city });
      return match;
    }
  }

  // ── 전략 4: state 단독 ────────────────────────────────────────────────────
  if (state) {
    const match = getCityHierarchyByName(state, state, 'city-only');
    if (match) {
      console.info('[region-utils] matched via state only', { state });
      return match;
    }
  }

  // ── 전략 5: 전체 텍스트 fallback (city+borough 명시적 조합 우선) ──────────
  // fallback에서도 city와 borough를 합친 형태를 텍스트에 포함시켜
  // "일산서구"만으로 매칭되는 것을 방지
  const fullText = [
    state,
    city && borough ? `${city} ${borough}` : '',
    city,
    borough,
    cityDistrict,
    county,
  ].filter(Boolean).join(' ');

  if (fullText) {
    const match = findHearingRegionFieldsByText(fullText, 'text-fallback');
    if (match) {
      console.info('[region-utils] matched via text fallback', { fullText });
      return match;
    }
  }

  console.warn('[region-utils] matchRegionFromAddress: no match found', { state, city, borough });
  return null;
}
