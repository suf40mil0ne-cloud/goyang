const confidenceCopy = [
  { min: 0.9, label: '위치 신뢰도 높음', tone: 'high', description: '법정동과 좌표가 비교적 명확하게 연결된 항목입니다.' },
  { min: 0.75, label: '위치 신뢰도 보통', tone: 'medium', description: '지역 단위와 열람 장소를 바탕으로 좌표를 추정한 항목입니다.' },
  { min: 0, label: '정확한 위치는 원문 확인 필요', tone: 'low', description: '제목과 행정구역 정보만으로 위치를 추정했으므로 원문 도면 확인이 필요합니다.' },
];

export function getLocationConfidenceMeta(score = 0) {
  return confidenceCopy.find((item) => score >= item.min) || confidenceCopy[confidenceCopy.length - 1];
}

export function normalizeLocationConfidence(notice) {
  const base = Number.isFinite(notice.locationConfidence) ? notice.locationConfidence : 0.7;
  if (notice.latitude && notice.longitude && notice.legalDong && notice.locationText) {
    return Math.min(0.98, Math.max(base, 0.8));
  }
  if (notice.sigungu && notice.locationText) {
    return Math.min(base, 0.78);
  }
  return Math.min(base, 0.64);
}
