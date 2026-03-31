import { describe, it, expect } from 'vitest';
import { findHearingRegionFieldsByText, extractSidoFromText } from './region-codes';

// ---------------------------------------------------------------------------
// findHearingRegionFieldsByText — 오매칭 방지
// ---------------------------------------------------------------------------

describe('findHearingRegionFieldsByText — 단일 문자 alias 오매칭 방지', () => {
  it('서울특별시 공고 텍스트에서 부산 서구가 나오지 않아야 함', () => {
    const result = findHearingRegionFieldsByText(
      '서울특별시 공고 제2026-976호 서울특별시 도시공간본부 도시관리과'
    );
    // 부산 서구의 단일 문자 alias "서"가 "서울특별시"의 "서"에 오매칭되면 안 됨
    expect(result).not.toBeNull();
    expect(result?.sido).toBe('서울특별시');
    expect(result?.sigungu).not.toBe('서구');
  });

  it('서울특별시 공고에서 대구 동구가 나오지 않아야 함', () => {
    const result = findHearingRegionFieldsByText(
      '서울특별시 균형발전본부 동남권사업과 공고 제2026-996호'
    );
    // 대구 동구의 단일 문자 alias "동"이 "동남권사업과"의 "동"에 오매칭되면 안 됨
    expect(result).not.toBeNull();
    expect(result?.sido).toBe('서울특별시');
    expect(result?.sigungu).not.toBe('동구');
  });

  it('부산 공고 텍스트에서 단일 문자 오매칭이 없어야 함', () => {
    const result = findHearingRegionFieldsByText(
      '부산광역시 공고 제2026-100호 부산광역시 도시계획과'
    );
    expect(result?.sido).toBe('부산광역시');
    // "서" 또는 "동" 단일 문자로 엉뚱한 구가 배정되면 안 됨
    expect(result?.sigungu).not.toBe('서구');
    expect(result?.sigungu).not.toBe('동구');
  });
});

// ---------------------------------------------------------------------------
// findHearingRegionFieldsByText — 정상 매칭
// ---------------------------------------------------------------------------

describe('findHearingRegionFieldsByText — 명시적 구 이름 정상 매칭', () => {
  it('부산광역시 서구가 본문에 명시되면 정확히 매칭', () => {
    const result = findHearingRegionFieldsByText(
      '부산광역시 서구 암남동 도시관리계획 결정(안) 주민공람 공고'
    );
    expect(result?.sido).toBe('부산광역시');
    expect(result?.sigungu).toBe('서구');
  });

  it('부산광역시 동구가 본문에 명시되면 정확히 매칭', () => {
    const result = findHearingRegionFieldsByText(
      '부산광역시 동구 범일동 지구단위계획 공고'
    );
    expect(result?.sido).toBe('부산광역시');
    expect(result?.sigungu).toBe('동구');
  });

  it('대구광역시 동구가 본문에 명시되면 정확히 매칭', () => {
    const result = findHearingRegionFieldsByText(
      '대구광역시 동구청 도시관리계획 결정 공람 공고'
    );
    expect(result?.sido).toBe('대구광역시');
    expect(result?.sigungu).toBe('동구');
  });

  it('서울특별시 강남구가 본문에 명시되면 구 단위까지 매칭', () => {
    const result = findHearingRegionFieldsByText(
      '서울특별시 강남구 삼성동 일대 지구단위계획 열람 공고'
    );
    expect(result?.sido).toBe('서울특별시');
    expect(result?.sigungu).toBe('강남구');
  });

  it('서울특별시 송파구가 본문에 명시되면 구 단위까지 매칭', () => {
    const result = findHearingRegionFieldsByText(
      '서울특별시 송파구 잠실동 도시관리계획 결정(변경)(안) 재열람 공고'
    );
    expect(result?.sido).toBe('서울특별시');
    expect(result?.sigungu).toBe('송파구');
  });

  it('경기도 성남시 분당구 지역 매칭', () => {
    const result = findHearingRegionFieldsByText(
      '경기도 성남시 분당구 판교동 지구단위계획구역 지정 공고'
    );
    expect(result?.sido).toBe('경기도');
    expect(result?.sigungu).toContain('분당구');
  });
});

// ---------------------------------------------------------------------------
// findHearingRegionFieldsByText — 시도 단위 fallback
// ---------------------------------------------------------------------------

describe('findHearingRegionFieldsByText — 구 정보 없으면 시도 단위 반환', () => {
  it('서울특별시만 언급된 경우 시도 단위로 반환', () => {
    const result = findHearingRegionFieldsByText('서울특별시 공고');
    expect(result?.sido).toBe('서울특별시');
  });

  it('경기도만 언급된 경우 시도 단위로 반환', () => {
    const result = findHearingRegionFieldsByText('경기도 공고 제2026-001호');
    expect(result?.sido).toBe('경기도');
    expect(result?.districtLevelRegionName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractSidoFromText
// ---------------------------------------------------------------------------

describe('extractSidoFromText', () => {
  it('서울특별시 공고번호에서 시도 추출', () => {
    expect(extractSidoFromText('서울특별시 공고 제2026-996호')).toBe('서울특별시');
  });

  it('부산광역시 공고번호에서 시도 추출', () => {
    expect(extractSidoFromText('부산광역시 부산진구 공고 제2026-100호')).toBe('부산광역시');
  });

  it('경기도 공고번호에서 시도 추출', () => {
    expect(extractSidoFromText('경기도 성남시 공고 제2026-200호')).toBe('경기도');
  });

  it('강원특별자치도 — 긴 형태 우선 매칭', () => {
    expect(extractSidoFromText('강원특별자치도 공고 제2026-300호')).toBe('강원특별자치도');
  });

  it('세종특별자치시 — 긴 형태 우선 매칭', () => {
    expect(extractSidoFromText('세종특별자치시 공고 제2026-400호')).toBe('세종특별자치시');
  });

  it('시도 이름이 없으면 null 반환', () => {
    expect(extractSidoFromText('도시관리계획 결정(변경)(안) 열람공고')).toBeNull();
  });

  it('텍스트 중간에 있으면 매칭 안 됨 (전두매칭)', () => {
    expect(extractSidoFromText('주민의견청취 서울특별시 공고')).toBeNull();
  });

  it('빈 문자열은 null 반환', () => {
    expect(extractSidoFromText('')).toBeNull();
    expect(extractSidoFromText(null)).toBeNull();
  });
});
