export async function onRequestGet(context) {
  const path = context.params.path || '';
  const upstreamPath = Array.isArray(path) ? path.join('/') : path;
  const upstreamUrl = `http://openapi.seoul.go.kr:8088/${upstreamPath}`;

  const response = await fetch(upstreamUrl, {
    headers: {
      Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
    },
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') || 'application/xml; charset=UTF-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
