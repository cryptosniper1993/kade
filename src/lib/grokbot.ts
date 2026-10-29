/** Pure helpers for the Grok Bot routine-webhook koppeling (geen server-imports). */

export type GrokHeaderMode = "bearer" | "custom";

export interface GrokContext {
  view: string;
  ids?: string[];
  samenvatting?: string;
}

export interface GrokPayload {
  opdracht: string;
  context: { view: string; ids: string[]; samenvatting: string };
  bron: "kade";
  tijd: string;
}

export const GROK_PREFIX = "/grok ";

/** Bouwt de JSON die naar de Grok Bot-routine gaat. */
export function buildGrokPayload(opdracht: string, context: GrokContext, now: Date = new Date()): GrokPayload {
  const text = String(opdracht ?? "").trim().slice(0, 4000);
  if (!text) throw new Error("Een opdracht kan niet leeg zijn.");
  return {
    opdracht: text,
    context: {
      view: String(context?.view ?? "").slice(0, 60),
      ids: (context?.ids ?? []).map((id) => String(id).slice(0, 80)).filter(Boolean).slice(0, 50),
      samenvatting: String(context?.samenvatting ?? "").slice(0, 2000),
    },
    bron: "kade",
    tijd: now.toISOString(),
  };
}

/** Haalt de opdracht uit een terminalregel met '/grok ' als prefix; null als het geen Grok-commando is. */
export function parseGrokCommand(line: string): string | null {
  const value = String(line ?? "").trimStart();
  if (!value.toLowerCase().startsWith(GROK_PREFIX.trim())) return null;
  const rest = value.slice(GROK_PREFIX.trim().length);
  if (rest && !/^\s/.test(rest)) return null;
  return rest.trim();
}

/** Header voor de sender key. */
export function authHeader(mode: GrokHeaderMode, headerName: string, key: string): [string, string] {
  if (mode === "custom") {
    const name = headerName.trim();
    if (!/^[A-Za-z0-9-]{1,64}$/.test(name)) throw new Error("Ongeldige headernaam.");
    return [name, key];
  }
  return ["Authorization", `Bearer ${key}`];
}

/** Toont enkel de laatste 4 tekens van een sleutel. */
export function maskKey(key: string): string {
  if (!key) return "";
  return `••••${key.slice(-4)}`;
}

export function validWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
  } catch {
    return false;
  }
}
