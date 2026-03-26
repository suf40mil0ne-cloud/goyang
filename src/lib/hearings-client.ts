import { CombinedHearingsResponse, filterAndSortHearings } from '../../shared/hearings';

type FetchHearingsParams = {
  page?: number;
  perPage?: number;
  sigunguCode?: string;
  includeEum?: boolean;
  includeMolit?: boolean;
};

export async function fetchHearings(params: FetchHearingsParams = {}): Promise<CombinedHearingsResponse> {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 200;

  const url = new URL('/api/hearings/combined', window.location.origin);
  url.searchParams.set('page', String(page));
  url.searchParams.set('perPage', String(perPage));

  if (params.sigunguCode) {
    url.searchParams.set('sigunguCode', params.sigunguCode);
  }
  if (params.includeEum != null) {
    url.searchParams.set('includeEum', String(params.includeEum));
  }
  if (params.includeMolit != null) {
    url.searchParams.set('includeMolit', String(params.includeMolit));
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`hearings-${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const preview = (await response.text()).slice(0, 200);
    console.error('[hearings-client] non-JSON response', {
      status: response.status,
      contentType,
      preview,
      url: response.url,
    });
    throw new Error(
      `API가 JSON이 아닌 응답을 반환했습니다 (${response.status} ${contentType}) — 로컬이면 wrangler pages dev가 실행 중인지 확인하세요`
    );
  }

  return response.json() as Promise<CombinedHearingsResponse>;
}

export { filterAndSortHearings };
