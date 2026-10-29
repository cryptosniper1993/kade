import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { db, str, uid } from "@/lib/ops-shared";
import { authHeader, buildGrokPayload, maskKey, validWebhookUrl, type GrokHeaderMode } from "@/lib/grokbot";

export interface GrokStatus {
  configured: boolean;
  webhookUrl: string;
  keyMasked: string;
  headerMode: GrokHeaderMode;
  headerName: string;
  lastStatus: number | null;
  lastCheckedAt: string | null;
}

export interface GrokLogEntry {
  id: string;
  opdracht: string;
  view: string;
  status: number | null;
  ok: boolean;
  detail: string;
  createdAt: string;
}

type Sql = Awaited<ReturnType<typeof db>>;

async function readRow(sql: Sql, userId: string) {
  const rows = await sql<Record<string, unknown>>`select * from grokbot_settings where user_id = ${userId}`;
  return rows[0];
}

function iso(v: unknown): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

/** Status voor de client: de sleutel zelf verlaat de server nooit. */
export const loadGrokBot = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const row = await readRow(sql, context.userId);
    const logs = await sql<Record<string, unknown>>`
      select id, opdracht, view, status, ok, detail, created_at from grokbot_log
      where user_id = ${context.userId} order by created_at desc limit 100`;
    const status: GrokStatus = {
      configured: Boolean(row && str(row.webhook_url, 2000) && str(row.sender_key, 2000)),
      webhookUrl: str(row?.webhook_url, 2000),
      keyMasked: maskKey(str(row?.sender_key, 2000)),
      headerMode: row?.header_mode === "custom" ? "custom" : "bearer",
      headerName: str(row?.header_name, 64),
      lastStatus: row?.last_status == null ? null : Number(row.last_status),
      lastCheckedAt: iso(row?.last_checked_at),
    };
    const log: GrokLogEntry[] = logs.map((l) => ({
      id: str(l.id, 80),
      opdracht: str(l.opdracht, 4000),
      view: str(l.view, 60),
      status: l.status == null ? null : Number(l.status),
      ok: Boolean(l.ok),
      detail: str(l.detail, 500),
      createdAt: iso(l.created_at) ?? "",
    }));
    return { status, log };
  });

export const saveGrokBot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as Record<string, unknown>;
    const webhookUrl = str(row.webhookUrl, 2000).trim();
    if (webhookUrl && !validWebhookUrl(webhookUrl)) throw new Error("De webhook-URL moet met https:// beginnen.");
    const headerMode: GrokHeaderMode = row.headerMode === "custom" ? "custom" : "bearer";
    const headerName = str(row.headerName, 64).trim();
    if (headerMode === "custom") authHeader("custom", headerName, "x");
    return { webhookUrl, senderKey: str(row.senderKey, 2000).trim(), headerMode, headerName };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    // Lege sleutel = bestaande sleutel behouden.
    await sql`
      insert into grokbot_settings (user_id, webhook_url, sender_key, header_mode, header_name)
      values (${context.userId}, ${data.webhookUrl}, ${data.senderKey}, ${data.headerMode}, ${data.headerName})
      on conflict (user_id) do update set
        webhook_url = excluded.webhook_url,
        sender_key = case when excluded.sender_key = '' then grokbot_settings.sender_key else excluded.sender_key end,
        header_mode = excluded.header_mode, header_name = excluded.header_name, updated_at = now()`;
    return { ok: true as const };
  });

export const clearGrokKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    await sql`update grokbot_settings set sender_key = '', last_status = null where user_id = ${context.userId}`;
    return { ok: true as const };
  });

/** POST naar de routine-webhook. Geeft de echte HTTP-status terug, nooit een gespeeld succes. */
export const sendToGrokBot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as Record<string, unknown>;
    const ctx = (row.context ?? {}) as Record<string, unknown>;
    return {
      opdracht: str(row.opdracht, 4000),
      test: Boolean(row.test),
      context: {
        view: str(ctx.view, 60),
        ids: Array.isArray(ctx.ids) ? ctx.ids.map((v) => str(v, 80)) : [],
        samenvatting: str(ctx.samenvatting, 2000),
      },
    };
  })
  .handler(async ({ context, data }): Promise<{ ok: boolean; status: number | null; detail: string }> => {
    const sql = await db();
    const row = await readRow(sql, context.userId);
    const url = str(row?.webhook_url, 2000);
    const key = str(row?.sender_key, 2000);
    if (!url || !key) return { ok: false, status: null, detail: "Grok Bot is nog niet gekoppeld. Vul de webhook en sleutel in bij Beheer > Instellingen." };
    const opdracht = data.test ? "Testbericht vanuit KADE: de koppeling werkt. Je hoeft niets te doen." : data.opdracht;
    let payload;
    try {
      payload = buildGrokPayload(opdracht, data.context);
    } catch (error) {
      return { ok: false, status: null, detail: error instanceof Error ? error.message : "Ongeldige opdracht." };
    }
    let status: number | null = null;
    let detail = "";
    try {
      const [name, value] = authHeader(row?.header_mode === "custom" ? "custom" : "bearer", str(row?.header_name, 64), key);
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", [name]: value },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      status = res.status;
      const body = (await res.text().catch(() => "")).slice(0, 300);
      detail = res.ok ? "Aangekomen. Het antwoord verschijnt in de Grok Bot-chat." : `HTTP ${res.status}${body ? `: ${body}` : ""}`;
    } catch (error) {
      detail = `Niet bereikt: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300);
    }
    const ok = status !== null && status >= 200 && status < 300;
    await sql`update grokbot_settings set last_status = ${status}, last_checked_at = now() where user_id = ${context.userId}`;
    await sql`
      insert into grokbot_log (id, user_id, opdracht, view, status, ok, detail)
      values (${uid()}, ${context.userId}, ${payload.opdracht}, ${data.test ? "test" : payload.context.view}, ${status}, ${ok}, ${detail})`;
    return { ok, status, detail };
  });
