var WORKER_URL = 'https://goyang-worker.suf40mil0ne.workers.dev';

(async () => {
  try {
    await fetch(`${WORKER_URL}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: location.pathname }),
      keepalive: true,
    });
  } catch {}
})();
