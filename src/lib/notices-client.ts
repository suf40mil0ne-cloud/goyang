import { filterAndSortNotices, NoticesResponse } from '../../shared/notices';

export async function fetchNotices(params: { page?: number; perPage?: number } = {}): Promise<NoticesResponse> {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 200;

  const url = new URL('/api/notices', window.location.origin);
  url.searchParams.set('page', String(page));
  url.searchParams.set('perPage', String(perPage));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`notices-${response.status}`);
  }

  return response.json() as Promise<NoticesResponse>;
}

export { filterAndSortNotices };
