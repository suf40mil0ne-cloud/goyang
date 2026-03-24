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

  return response.json() as Promise<CombinedHearingsResponse>;
}

export { filterAndSortHearings };
