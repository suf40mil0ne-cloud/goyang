export const sourceCatalog = {
  'land-hearing': {
    label: '토지이음 주민의견청취 공람',
    url: 'https://www.eum.go.kr/web/cp/hr/hrPeopleHearList.jsp',
    description: '토지이음의 주민의견청취 공람 목록입니다.',
  },
  'internet-hearing': {
    label: '토지이음 인터넷 주민의견청취',
    url: 'https://www.eum.go.kr/web/cp/ih/ihHearingList.jsp',
    description: '토지이음의 인터넷 주민의견청취 목록입니다.',
  },
  'follow-up-gosi': {
    label: '토지이음 후속 고시·결정·실시 추적',
    url: 'https://www.eum.go.kr/',
    description: '고시정보, 결정고시, 실시계획인가 등 후속 절차 추적용 소스입니다.',
  },
  'public-data': {
    label: '공공데이터포털 보조 데이터',
    url: 'https://www.data.go.kr/',
    description: '국토교통부 인터넷 주민의견청취 공고 등 보조 정규화 기준입니다.',
  },
};

export function getSourceMeta(sourceType) {
  return sourceCatalog[sourceType] || {
    label: sourceType,
    url: '',
    description: '',
  };
}
