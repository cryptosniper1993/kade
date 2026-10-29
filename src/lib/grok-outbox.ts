/** Pure regels voor de GROK BOTS-outbox (retry met backoff). */
export const OUTBOX_MAX_ATTEMPTS = 24;

/** Backoff: 1, 2, 4, ... minuten, maximaal 3 uur. 24 pogingen dekken ruim 2 dagen storing. */
export function backoffMs(attempts: number): number {
  return Math.min(2 ** Math.max(0, attempts - 1) * 60_000, 3 * 3600_000);
}

/** Moet een mislukte levering in de outbox (opnieuw proberen) of is het een definitieve fout? */
export function retryable(status: number | null): boolean {
  return status === null || status === 408 || status === 429 || status >= 500;
}

export function nextState(attempts: number, status: number | null, now = Date.now()): { status: "verzonden" | "wachtrij" | "mislukt"; nextAt: Date | null } {
  if (status !== null && status >= 200 && status < 300) return { status: "verzonden", nextAt: null };
  if (!retryable(status) || attempts >= OUTBOX_MAX_ATTEMPTS) return { status: "mislukt", nextAt: null };
  return { status: "wachtrij", nextAt: new Date(now + backoffMs(attempts)) };
}

export function totalWindowMs(): number {
  let t = 0;
  for (let a = 1; a < OUTBOX_MAX_ATTEMPTS; a++) t += backoffMs(a);
  return t;
}
