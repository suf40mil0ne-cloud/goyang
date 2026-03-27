import { getBuildStamp, type BuildStampEnv } from '../../lib/build-stamp';
import { EUM_LIST_FETCH_TIMEOUT_MS, EumStageError, probeEumListConnection } from '../../lib/eum-hearings';

type RequestContext = {
  request: Request;
  env: BuildStampEnv;
};

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
    },
  });
}

export async function onRequestGet(context: RequestContext): Promise<Response> {
  const requestUrl = new URL(context.request.url);
  const query = {
    startdt: requestUrl.searchParams.get('startdt') || '',
    enddt: requestUrl.searchParams.get('enddt') || '',
    selSggCd: requestUrl.searchParams.get('selSggCd') || '',
    zonenm: requestUrl.searchParams.get('zonenm') || '',
    chrgorg: requestUrl.searchParams.get('chrgorg') || '',
    gosino: requestUrl.searchParams.get('gosino') || '',
  };

  try {
    const probe = await probeEumListConnection(query);
    return createJsonResponse({
      ok: true,
      buildStamp: getBuildStamp(context.env),
      effectiveListFetchTimeoutMs: EUM_LIST_FETCH_TIMEOUT_MS,
      ...probe,
    }, 200);
  } catch (error) {
    if (error instanceof EumStageError) {
      return createJsonResponse({
        ok: false,
        buildStamp: getBuildStamp(context.env),
        effectiveListFetchTimeoutMs: EUM_LIST_FETCH_TIMEOUT_MS,
        stage: error.stage,
        message: error.message,
        ...error.debug,
      }, 502);
    }

    return createJsonResponse({
      ok: false,
      buildStamp: getBuildStamp(context.env),
      effectiveListFetchTimeoutMs: EUM_LIST_FETCH_TIMEOUT_MS,
      stage: 'unknown',
      message: error instanceof Error ? error.message : String(error),
    }, 502);
  }
}
