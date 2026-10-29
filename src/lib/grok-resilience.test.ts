import { test } from "node:test";
import assert from "node:assert/strict";
import { callGrok, GROK_DOWN, grokHealth, grokState } from "./grok-client.ts";
import { backoffMs, nextState, retryable, totalWindowMs } from "./grok-outbox.ts";

test("zonder XAI_API_KEY: nette melding, geen netwerk", async () => {
  delete process.env.XAI_API_KEY;
  let called = false;
  const r = await callGrok("s", "u", { maxTokens: 10, fetchImpl: (async () => { called = true; return new Response(); }) as unknown as typeof fetch });
  assert.equal(r.ok, false);
  assert.equal(called, false);
  assert.equal(grokState(grokHealth()), "uit");
});

test("grok down: netwerkfout en timeout geven 'tijdelijk onbereikbaar'", async () => {
  process.env.XAI_API_KEY = "test";
  const down = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
  const r = await callGrok("s", "u", { maxTokens: 10, fetchImpl: down });
  assert.deepEqual(r, { ok: false, error: GROK_DOWN });
  const hang = ((_u: string, init?: RequestInit) => new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("timeout", "TimeoutError"))))) as unknown as typeof fetch;
  const t0 = Date.now();
  const r2 = await callGrok("s", "u", { maxTokens: 10, fetchImpl: hang, timeoutMs: 50 });
  assert.equal(r2.ok, false);
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(grokState(grokHealth()), "storing");
  const r3 = await callGrok("s", "u", { maxTokens: 10, fetchImpl: (async () => new Response("", { status: 503 })) as unknown as typeof fetch });
  assert.deepEqual(r3, { ok: false, error: GROK_DOWN });
});

test("grok terug: status ok", async () => {
  process.env.XAI_API_KEY = "test";
  const ok = (async () => new Response(JSON.stringify({ choices: [{ message: { content: "hallo" } }] }), { status: 200 })) as unknown as typeof fetch;
  assert.deepEqual(await callGrok("s", "u", { maxTokens: 10, fetchImpl: ok }), { ok: true, text: "hallo" });
  assert.equal(grokState(grokHealth()), "ok");
  delete process.env.XAI_API_KEY;
});

test("outbox: backoff, retry en eindstatus", () => {
  assert.equal(backoffMs(1), 60_000);
  assert.equal(backoffMs(3), 240_000);
  assert.equal(backoffMs(30), 3 * 3600_000);
  assert.ok(totalWindowMs() > 2 * 24 * 3600_000);
  assert.ok(retryable(null) && retryable(503) && retryable(429));
  assert.ok(!retryable(401) && !retryable(404));
  assert.equal(nextState(1, 200).status, "verzonden");
  assert.equal(nextState(1, null, 0).nextAt?.getTime(), 60_000);
  assert.equal(nextState(1, 401).status, "mislukt");
  assert.equal(nextState(24, 503).status, "mislukt");
});
