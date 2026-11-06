// Poll a URL until it answers 200 (TOD-106). Coolify reports a deployment "finished" before the API container
// has run its migrations and started listening, so the proxy answers 502 for a short while. No dependencies.
// fetch, sleep and now are injectable so the check in wait-for.test.mjs needs no network and no real waiting.
export async function waitFor(url, { fetch = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, everyMs = 3000, timeoutMs = 90_000 } = {}) {
  const start = now();
  for (;;) {
    let last;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      await res.body?.cancel();
      if (res.status === 200) return;
      last = `status ${res.status}`;
    } catch (e) {
      last = `network error: ${e.cause?.code ?? e.message}`;
    }
    const waited = now() - start;
    if (waited >= timeoutMs) throw new Error(`${url} not up after ${Math.round(waited / 1000)} s (last: ${last})`);
    await sleep(everyMs);
  }
}
