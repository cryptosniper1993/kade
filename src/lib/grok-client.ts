/**
 * Veerkrachtige xAI-oproep: korte timeout, nooit een exception naar de pagina, en een gezondheidsstatus
 * die #setup toont. KADE werkt volledig zonder XAI_API_KEY; enkel AI-antwoorden vallen dan weg.
 */
export const GROK_DOWN = "Grok tijdelijk onbereikbaar. De rest van KADE werkt gewoon; probeer later opnieuw.";

export type GrokResult = { ok: true; text: string } | { ok: false; error: string };

export interface GrokHealth { configured: boolean; lastOkAt: string | null; lastFailAt: string | null; lastError: string; consecutiveFails: number }

const g = globalThis as { __grokHealth__?: GrokHealth };
function health(): GrokHealth {
  return (g.__grokHealth__ ??= { configured: false, lastOkAt: null, lastFailAt: null, lastError: "", consecutiveFails: 0 });
}

export function grokHealth(): GrokHealth {
  return { ...health(), configured: Boolean(process.env.XAI_API_KEY?.trim()) };
}

export function noteGrok(ok: boolean, error = "", now = new Date()) {
  const h = health();
  if (ok) { h.lastOkAt = now.toISOString(); h.consecutiveFails = 0; h.lastError = ""; }
  else { h.lastFailAt = now.toISOString(); h.consecutiveFails++; h.lastError = error.slice(0, 200); }
}

/** "ok" | "storing" | "uit" | "onbekend" voor de badge op #setup. */
export function grokState(h: GrokHealth): "ok" | "storing" | "uit" | "onbekend" {
  if (!h.configured) return "uit";
  if (h.consecutiveFails > 0 && (!h.lastOkAt || (h.lastFailAt ?? "") > h.lastOkAt)) return "storing";
  return h.lastOkAt ? "ok" : "onbekend";
}

export async function callGrok(
  system: string,
  user: string,
  opts: { maxTokens: number; temperature?: number; maxInput?: number; noKey?: string; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<GrokResult> {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: opts.noKey ?? "Geen lijn naar Grok. De boeken werken wel." };
  const f = opts.fetchImpl ?? fetch;
  try {
    const res = await f("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: opts.maxTokens,
        temperature: opts.temperature ?? 0.4,
        messages: [{ role: "system", content: system }, { role: "user", content: user.slice(0, opts.maxInput ?? 12000) }],
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 25000),
    });
    if (!res.ok) {
      noteGrok(false, `HTTP ${res.status}`);
      return { ok: false, error: res.status >= 500 || res.status === 429 ? GROK_DOWN : `Grok antwoordde niet (${res.status}). Probeer opnieuw.` };
    }
    const body = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content?.trim() ?? "";
    noteGrok(true);
    if (!text) return { ok: false, error: "Grok gaf een leeg antwoord." };
    return { ok: true, text };
  } catch (e) {
    noteGrok(false, e instanceof Error ? e.message : String(e));
    return { ok: false, error: GROK_DOWN };
  }
}
