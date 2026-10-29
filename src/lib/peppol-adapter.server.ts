/** Generieke Peppol access point-adapter (enkel server). Zie docs/handleiding/peppol-provider.md. */
import { env } from "@/lib/env.server";
import { str } from "@/lib/ops-shared";

export type Adapter = {
  provider: string;
  test(): Promise<void>;
  isReceiver(peppolId: string): Promise<boolean>;
  send(xml: string, receiver: string, sender: string): Promise<{ ref: string }>;
  /** Ids van ontvangen documenten die nog niet opgehaald zijn. */
  inbox(): Promise<string[]>;
  /** UBL-XML van één ontvangen document. */
  fetchDocument(id: string): Promise<string>;
  /** Bevestigt dat Kade het document heeft (optioneel bij de provider; 404/405 wordt genegeerd). */
  ack(id: string): Promise<void>;
};

/**
 * Generiek contract (veel providers bieden iets gelijkaardigs; anders schrijf je hier een kleine adapter per provider):
 *   GET  {base}/health                          -> 2xx
 *   GET  {base}/participants/{peppolId}         -> 200 { registered: boolean } of 404
 *   POST {base}/documents (application/xml UBL) -> 2xx { id }
 *   GET  {base}/inbox                           -> 200 [{ id }] of { documents: [{ id }] } (ontvangen, nog niet bevestigd)
 *   GET  {base}/inbox/{id}                      -> 200 UBL-XML (of JSON { xml })
 *   POST {base}/inbox/{id}/ack                  -> 2xx (optioneel)
 * Authenticatie: Authorization: Bearer <PEPPOL_API_KEY>.
 */
export function adapter(): Adapter | null {
  const base = env("PEPPOL_API_URL")?.replace(/\/+$/, "");
  const key = env("PEPPOL_API_KEY");
  if (!base || !key) return null;
  const headers = { Authorization: `Bearer ${key}`, Accept: "application/json" };
  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(15000) });
    return res;
  }
  async function fail(res: Response, what: string): Promise<never> {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`${what}: provider antwoordde ${res.status}${body ? ` (${body})` : ""}.`);
  }
  return {
    provider: env("PEPPOL_PROVIDER") || "Generieke access point",
    async test() {
      const res = await call("/health");
      if (!res.ok) await fail(res, "Verbinding mislukt");
    },
    async isReceiver(id) {
      const res = await call(`/participants/${encodeURIComponent(id)}`);
      if (res.status === 404) return false;
      if (!res.ok) await fail(res, "Opzoeken mislukt");
      const json = (await res.json().catch(() => ({}))) as { registered?: boolean };
      return json.registered !== false;
    },
    async send(xml, receiver, sender) {
      const res = await call("/documents", {
        method: "POST",
        headers: { "Content-Type": "application/xml", "X-Peppol-Receiver": receiver, "X-Peppol-Sender": sender },
        body: xml,
      });
      if (!res.ok) await fail(res, "Verzenden mislukt");
      const json = (await res.json().catch(() => ({}))) as { id?: string };
      return { ref: str(json.id, 120) };
    },
    async inbox() {
      const res = await call("/inbox");
      if (!res.ok) await fail(res, "Inbox ophalen mislukt");
      const json = (await res.json().catch(() => [])) as unknown;
      const list = Array.isArray(json) ? json : ((json as { documents?: unknown[]; items?: unknown[] })?.documents ?? (json as { items?: unknown[] })?.items ?? []);
      return list
        .map((d) => (typeof d === "string" ? d : str((d as { id?: unknown })?.id, 200)))
        .filter(Boolean)
        .slice(0, 200);
    },
    async fetchDocument(id) {
      const res = await call(`/inbox/${encodeURIComponent(id)}`, { headers: { Accept: "application/xml, application/json" } });
      if (!res.ok) await fail(res, "Document ophalen mislukt");
      const body = await res.text();
      if (body.trimStart().startsWith("{")) {
        const json = JSON.parse(body) as { xml?: string; ubl?: string; document?: string };
        return String(json.xml ?? json.ubl ?? json.document ?? "");
      }
      return body;
    },
    async ack(id) {
      const res = await call(`/inbox/${encodeURIComponent(id)}/ack`, { method: "POST" });
      if (!res.ok && res.status !== 404 && res.status !== 405) await fail(res, "Bevestigen mislukt");
    },
  };
}

export const NOT_CONNECTED = "Peppol is niet verbonden. Neem een account bij een erkende Peppol-dienstverlener en zet PEPPOL_API_URL en PEPPOL_API_KEY als geheim op de server.";
