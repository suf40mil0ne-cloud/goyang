import { findSigunguCodeByRegion } from '../../shared/region-codes';
import {
  matchesPublicHearingQuery,
  PublicHearingItem,
  PublicHearingsResponse,
  sortPublicHearings,
} from '../../shared/public-hearings';

export async function fetchPublicHearings(params: {
  page?: number;
  perPage?: number;
  sido?: string;
  sigungu?: string;
} = {}): Promise<PublicHearingsResponse> {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 100;
  const sigunguCode = params.sido && params.sigungu
    ? findSigunguCodeByRegion(params.sido, params.sigungu)
    : '';

  const url = new URL('/api/public-hearings', window.location.origin);
  url.searchParams.set('page', String(page));
  url.searchParams.set('perPage', String(perPage));

  if (sigunguCode) {
    url.searchParams.set('sigunguCode', sigunguCode);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`public-hearings-${response.status}`);
  }

  return response.json() as Promise<PublicHearingsResponse>;
}

export function filterAndSortPublicHearings(
  items: PublicHearingItem[],
  searchQuery: string
): PublicHearingItem[] {
  return sortPublicHearings(items.filter((item) => matchesPublicHearingQuery(item, searchQuery)));
}
