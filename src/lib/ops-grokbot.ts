import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { db, str, uid } from "@/lib/ops-shared";
import { authHeader, buildGrokPayload, maskKey, validWebhookUrl, type GrokHeaderMode } from "@/lib/grokbot";
import { contextBlocker } from "@/lib/outreach";
import { nextState, retryable } from "@/lib/grok-outbox";

/**
 * GROK BOTS: meerdere uitgaande Grok Bot-routinewebhooks per account (joly jumper, projectbots, ...).
 * Eén bot is actief; de sleutel verlaat de server nooit (alleen gemaskeerd).
 */

export interface GrokStatus {
  configured: boolean;
  webhookUrl: string;
  keyMasked: string;
  headerMode: GrokHeaderMode;
  headerName: string;
  lastStatus: number | null;
  lastCheckedAt: string | null;
}

export interface GrokBotEntry extends GrokStatus {
  id: string;
  name: string;
  role: string;
  grokBotId: string;
  scope: "sales" | "project";
  projectId: string | null;
  active: boolean;
}

export interface GrokLogEntry {
  id: string;
  botId: string | null;
  opdracht: string;
  view: string;
  status: number | null;
  ok: boolean;
  detail: string;
  createdAt: string;
}

type Sql = Awaited<ReturnType<typeof db>>;

function iso(v: unknown): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

async function activeId(sql: Sql, userId: string): Promise<string> {
  const rows = await sql<{ active_grok_bot: string }>`select active_grok_bot from desk_settings where user_id = ${userId}`;
  return str(rows[0]?.active_grok_bot, 80);
}

function mapBot(r: Record<string, unknown>, active: string): GrokBotEntry {
  const url = str(r.webhook_url, 2000);
  const key = str(r.sender_key, 2000);
  return {
    id: str(r.id, 80), name: str(r.name, 80), role: str(r.role, 400), grokBotId: str(r.grok_bot_id, 80),
    scope: str(r.scope, 10) === "project" ? "project" : "sales", projectId: r.project_id ? str(r.project_id, 80) : null,
    configured: Boolean(url && key), webhookUrl: url, keyMasked: key ? maskKey(key) : "",
    headerMode: r.header_mode === "custom" ? "custom" : "bearer", headerName: str(r.header_name, 64),
    lastStatus: r.last_status == null ? null : Number(r.last_status), lastCheckedAt: iso(r.last_checked_at),
    active: str(r.id, 80) === active,
  };
}

async function readBots(sql: Sql, userId: string): Promise<GrokBotEntry[]> {
  const active = await activeId(sql, userId);
  const rows = await sql<Record<string, unknown>>`select * from grok_bots where user_id = ${userId} order by created_at`;
  const bots = rows.map((r) => mapBot(r, active));
  if (bots.length && !bots.some((b) => b.active)) bots[0].active = true;
  return bots;
}

function mapLog(r: Record<string, unknown>): GrokLogEntry {
  return {
    id: str(r.id, 80), botId: r.bot_id ? str(r.bot_id, 80) : null, opdracht: str(r.opdracht, 4000), view: str(r.view, 60),
    status: r.status == null ? null : Number(r.status), ok: Boolean(r.ok), detail: str(r.detail, 400), createdAt: iso(r.created_at) ?? "",
  };
}

/** Alle bots + log. `status` is de actieve bot (compatibel met de oude enkelvoudige koppeling). */
export const loadGrokBot = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const bots = await readBots(sql, context.userId);
    const act = bots.find((b) => b.active) ?? null;
    const status: GrokStatus = act ?? { configured: false, webhookUrl: "", keyMasked: "", headerMode: "bearer", headerName: "", lastStatus: null, lastCheckedAt: null };
    const rows = await sql<Record<string, unknown>>`select * from grokbot_log where user_id = ${context.userId} order by created_at desc limit 200`;
    return { status, bots, activeId: act?.id ?? "", log: rows.map(mapLog) };
  });

export const saveGrokBotEntry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const r = (input ?? {}) as Record<string, unknown>;
    const name = str(r.name, 80);
    if (!name) throw new Error("Geef de bot een naam.");
    const webhookUrl = str(r.webhookUrl, 2000);
    if (webhookUrl && !validWebhookUrl(webhookUrl)) throw new Error("Gebruik een https-webhook-URL.");
    const headerMode: GrokHeaderMode = r.headerMode === "custom" ? "custom" : "bearer";
    const headerName = str(r.headerName, 64);
    if (headerMode === "custom" && !/^[A-Za-z0-9-]{1,64}$/.test(headerName)) throw new Error("Geef een geldige headernaam.");
    const scope = r.scope === "project" ? "project" : "sales";
    const projectId = scope === "project" ? str(r.projectId, 80) || null : null;
    if (scope === "project" && !projectId) throw new Error("Een projectbot hoort bij één project.");
    return { id: str(r.id, 80), name, role: str(r.role, 400), grokBotId: str(r.grokBotId, 80), scope, projectId, webhookUrl, senderKey: str(r.senderKey, 2000), headerMode, headerName };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const u = context.userId;
    if (data.projectId) {
      const p = await sql<{ id: string }>`select id from projects where id = ${data.projectId} and user_id = ${u}`;
      if (!p[0]) throw new Error("Project niet gevonden.");
    }
    if (data.id) {
      const rows = await sql<{ id: string }>`update grok_bots set name = ${data.name}, role = ${data.role}, grok_bot_id = ${data.grokBotId}, scope = ${data.scope},
        project_id = ${data.projectId}, webhook_url = ${data.webhookUrl}, header_mode = ${data.headerMode}, header_name = ${data.headerName},
        sender_key = case when ${data.senderKey} = '' then sender_key else ${data.senderKey} end
        where id = ${data.id} and user_id = ${u} returning id`;
      if (!rows[0]) throw new Error("Bot niet gevonden.");
    } else {
      data.id = uid();
      await sql`insert into grok_bots (id, user_id, name, role, grok_bot_id, scope, project_id, webhook_url, sender_key, header_mode, header_name)
        values (${data.id}, ${u}, ${data.name}, ${data.role}, ${data.grokBotId}, ${data.scope}, ${data.projectId}, ${data.webhookUrl}, ${data.senderKey}, ${data.headerMode}, ${data.headerName})`;
    }
    if (data.projectId) await sql`update projects set bot_id = ${data.grokBotId || data.id} where id = ${data.projectId} and user_id = ${u}`;
    await sql`insert into audit_log (id, user_id, actor, action, object, object_id, detail) values (${uid()}, ${u}, 'kobe', 'grokbot.save', 'grokbot', ${data.id}, ${data.name})`;
    return { id: data.id };
  });

/** Oude enkelvoudige "Grok Bot"-instelling: bewaart de actieve bot (of maakt er een). */
export const saveGrokBot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const r = (input ?? {}) as Record<string, unknown>;
    const webhookUrl = str(r.webhookUrl, 2000);
    if (webhookUrl && !validWebhookUrl(webhookUrl)) throw new Error("Gebruik een https-webhook-URL.");
    return { webhookUrl, senderKey: str(r.senderKey, 2000), headerMode: (r.headerMode === "custom" ? "custom" : "bearer") as GrokHeaderMode, headerName: str(r.headerName, 64) };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const bots = await readBots(sql, context.userId);
    const act = bots.find((b) => b.active);
    if (act) {
      await sql`update grok_bots set webhook_url = ${data.webhookUrl}, header_mode = ${data.headerMode}, header_name = ${data.headerName},
        sender_key = case when ${data.senderKey} = '' then sender_key else ${data.senderKey} end where id = ${act.id} and user_id = ${context.userId}`;
    } else {
      await sql`insert into grok_bots (id, user_id, name, webhook_url, sender_key, header_mode, header_name)
        values (${uid()}, ${context.userId}, 'Grok Bot', ${data.webhookUrl}, ${data.senderKey}, ${data.headerMode}, ${data.headerName})`;
    }
    return { ok: true as const };
  });

export const deleteGrokBot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => str((input as { id?: string })?.id, 80))
  .handler(async ({ context, data }) => {
    const sql = await db();
    await sql`delete from grok_bots where id = ${data} and user_id = ${context.userId}`;
    await sql`insert into audit_log (id, user_id, actor, action, object, object_id) values (${uid()}, ${context.userId}, 'kobe', 'grokbot.delete', 'grokbot', ${data})`;
    return { ok: true as const };
  });

export const setActiveGrokBot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => str((input as { id?: string })?.id, 80))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const rows = await sql<{ id: string }>`select id from grok_bots where id = ${data} and user_id = ${context.userId}`;
    if (!rows[0]) throw new Error("Bot niet gevonden.");
    await sql`insert into desk_settings (user_id, active_grok_bot) values (${context.userId}, ${data})
      on conflict (user_id) do update set active_grok_bot = excluded.active_grok_bot`;
    return { ok: true as const };
  });

export const clearGrokKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => str((input as { id?: string } | undefined)?.id, 80))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const id = data || (await readBots(sql, context.userId)).find((b) => b.active)?.id || "";
    await sql`update grok_bots set sender_key = '', last_status = null where id = ${id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

/**
 * POST naar de webhook van een bot (standaard de actieve). Geeft de echte HTTP-status terug.
 * Vertrouwelijkheid: een projectbot krijgt nooit context of ids van een ander project.
 */
export const sendToGrokBot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as Record<string, unknown>;
    const ctx = (row.context ?? {}) as Record<string, unknown>;
    return {
      botId: str(row.botId, 80),
      opdracht: str(row.opdracht, 4000),
      test: Boolean(row.test),
      context: {
        view: str(ctx.view, 60),
        ids: Array.isArray(ctx.ids) ? ctx.ids.map((v) => str(v, 80)) : [],
        samenvatting: str(ctx.samenvatting, 2000),
      },
    };
  })
  .handler(async ({ context, data }): Promise<{ ok: boolean; status: number | null; detail: string; botName: string; queued?: boolean }> => {
    const sql = await db();
    const u = context.userId;
    const bots = await readBots(sql, u);
    const bot = data.botId ? bots.find((b) => b.id === data.botId) : bots.find((b) => b.active);
    if (!bot) return { ok: false, status: null, detail: "Nog geen Grok Bot gekoppeld. Voeg er een toe onder GROK BOTS.", botName: "" };
    const raw = (await sql<Record<string, unknown>>`select webhook_url, sender_key from grok_bots where id = ${bot.id} and user_id = ${u}`)[0];
    const url = str(raw?.webhook_url, 2000);
    const key = str(raw?.sender_key, 2000);
    if (!url || !key) return { ok: false, status: null, detail: `${bot.name} heeft nog geen webhook of sleutel.`, botName: bot.name };
    if (bot.scope === "project") {
      const projects = await sql<{ id: string; confidential: boolean }>`select id, confidential from projects where user_id = ${u}`;
      const block = contextBlocker({ kind: "project", projectId: bot.projectId ?? "" }, data.context.ids, projects, data.context.view);
      if (block) return { ok: false, status: null, detail: block, botName: bot.name };
      // Een projectbot krijgt geen samenvatting van een algemeen scherm mee (kan andere klanten bevatten).
      if (data.context.view !== "projecten") data.context.samenvatting = "";
      data.context.ids = [bot.projectId ?? ""];
    }
    const opdracht = data.test ? "Testbericht vanuit KADE: de koppeling werkt. Je hoeft niets te doen." : data.opdracht;
    let payload;
    try {
      payload = buildGrokPayload(opdracht, data.context);
    } catch (error) {
      return { ok: false, status: null, detail: error instanceof Error ? error.message : "Ongeldige opdracht.", botName: bot.name };
    }
    const body = { ...payload, bot: { naam: bot.name, id: bot.grokBotId || bot.id } };
    const { status, detail: raw0 } = await deliver(url, bot, key, body);
    let detail = raw0;
    const ok = status !== null && status >= 200 && status < 300;
    if (ok) detail = `Aangekomen bij ${bot.name}. Het antwoord verschijnt in de Grok Bot-chat.`;
    let queued = false;
    if (!ok && !data.test && retryable(status)) {
      const st = nextState(1, status);
      await sql`insert into grokbot_outbox (id, user_id, bot_id, body, opdracht, status, attempts, next_attempt_at, last_status, last_error)
        values (${uid()}, ${u}, ${bot.id}, ${JSON.stringify(body)}::jsonb, ${payload.opdracht.slice(0, 500)}, 'wachtrij', 1, ${st.nextAt!.toISOString()}, ${status}, ${detail})`;
      queued = true;
      detail = `${bot.name} is nu niet bereikbaar (${detail}). De opdracht staat in de wachtrij en wordt automatisch opnieuw verstuurd.`;
    }
    await sql`update grok_bots set last_status = ${status}, last_checked_at = now() where id = ${bot.id} and user_id = ${u}`;
    await sql`
      insert into grokbot_log (id, user_id, bot_id, opdracht, view, status, ok, detail)
      values (${uid()}, ${u}, ${bot.id}, ${payload.opdracht}, ${data.test ? "test" : payload.context.view}, ${status}, ${ok}, ${detail})`;
    return { ok, status, detail, botName: bot.name, queued };
  });

/** Eén levering naar een Grok Bot-webhook. Nooit een exception; korte timeout. */
export async function deliver(url: string, bot: Pick<GrokBotEntry, "headerMode" | "headerName">, key: string, body: unknown, f: typeof fetch = fetch): Promise<{ status: number | null; detail: string }> {
  try {
    const [name, value] = authHeader(bot.headerMode, bot.headerName, key);
    const res = await f(url, { method: "POST", headers: { "content-type": "application/json", [name]: value }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const text = (await res.text().catch(() => "")).slice(0, 300);
    return { status: res.status, detail: res.ok ? "ok" : `HTTP ${res.status}${text ? `: ${text}` : ""}` };
  } catch (error) {
    return { status: null, detail: `Niet bereikt: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300) };
  }
}

export interface OutboxItem { id: string; botId: string; botName: string; opdracht: string; status: string; attempts: number; nextAttemptAt: string; lastStatus: number | null; lastError: string; createdAt: string; sentAt: string | null }

async function readOutbox(sql: Awaited<ReturnType<typeof db>>, u: string): Promise<OutboxItem[]> {
  const rows = await sql<Record<string, unknown>>`select o.*, b.name as bot_name from grokbot_outbox o left join grok_bots b on b.id = o.bot_id and b.user_id = o.user_id
    where o.user_id = ${u} order by o.created_at desc limit 100`;
  const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
  return rows.map((r) => ({ id: String(r.id), botId: String(r.bot_id), botName: str(r.bot_name, 120) || "(verwijderd)", opdracht: str(r.opdracht, 500), status: String(r.status), attempts: Number(r.attempts), nextAttemptAt: iso(r.next_attempt_at)!, lastStatus: r.last_status == null ? null : Number(r.last_status), lastError: str(r.last_error, 300), createdAt: iso(r.created_at)!, sentAt: iso(r.sent_at) }));
}

/** Verstuurt wachtende opdrachten waarvan de tijd gekomen is (of één specifieke, `force`). */
export async function processOutbox(sql: Awaited<ReturnType<typeof db>>, u: string, opts: { id?: string; force?: boolean; f?: typeof fetch } = {}): Promise<{ sent: number; failed: number }> {
  const due = opts.id
    ? await sql<Record<string, unknown>>`select * from grokbot_outbox where user_id = ${u} and id = ${opts.id} and status in ('wachtrij','mislukt')`
    : await sql<Record<string, unknown>>`select * from grokbot_outbox where user_id = ${u} and status = 'wachtrij' and next_attempt_at <= now() order by created_at limit 20`;
  let sent = 0; let failed = 0;
  for (const r of due) {
    const b = (await sql<Record<string, unknown>>`select * from grok_bots where id = ${String(r.bot_id)} and user_id = ${u}`)[0];
    const attempts = Number(r.attempts) + 1;
    if (!b || !b.webhook_url || !b.sender_key) {
      await sql`update grokbot_outbox set status = 'mislukt', attempts = ${attempts}, last_error = 'Bot bestaat niet meer of heeft geen webhook.' where id = ${String(r.id)}`;
      failed++; continue;
    }
    const body = typeof r.body === "string" ? JSON.parse(r.body) : r.body;
    const res = await deliver(String(b.webhook_url), { headerMode: (b.header_mode === "custom" ? "custom" : "bearer") as GrokHeaderMode, headerName: str(b.header_name, 80) }, String(b.sender_key), body, opts.f);
    const st = nextState(attempts, res.status);
    await sql`update grokbot_outbox set status = ${st.status}, attempts = ${attempts}, next_attempt_at = ${(st.nextAt ?? new Date()).toISOString()},
      last_status = ${res.status}, last_error = ${st.status === "verzonden" ? "" : res.detail}, sent_at = ${st.status === "verzonden" ? new Date().toISOString() : null} where id = ${String(r.id)}`;
    await sql`insert into grokbot_log (id, user_id, bot_id, opdracht, view, status, ok, detail)
      values (${uid()}, ${u}, ${String(r.bot_id)}, ${str(r.opdracht, 500)}, 'wachtrij', ${res.status}, ${st.status === "verzonden"}, ${st.status === "verzonden" ? "Alsnog aangekomen (wachtrij)." : res.detail})`;
    if (st.status === "verzonden") sent++; else failed++;
  }
  return { sent, failed };
}

export const loadOutbox = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    // Elke keer dat iemand GROK BOTS of Setup opent, worden vervallen pogingen meteen uitgevoerd.
    await processOutbox(sql, context.userId).catch(() => null);
    return readOutbox(sql, context.userId);
  });

export const retryOutbox = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: str((input as { id?: string })?.id, 80) }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    if (data.id) await sql`update grokbot_outbox set status = 'wachtrij', next_attempt_at = now() where id = ${data.id} and user_id = ${context.userId} and status = 'mislukt'`;
    else await sql`update grokbot_outbox set next_attempt_at = now() where user_id = ${context.userId} and status = 'wachtrij'`;
    return processOutbox(sql, context.userId, data.id ? { id: data.id } : {});
  });

export const cancelOutbox = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => str((input as { id?: string })?.id, 80))
  .handler(async ({ context, data }) => {
    const sql = await db();
    await sql`update grokbot_outbox set status = 'geannuleerd' where id = ${data} and user_id = ${context.userId} and status in ('wachtrij','mislukt')`;
    return { ok: true };
  });
