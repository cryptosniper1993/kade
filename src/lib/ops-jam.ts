import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { db, str, uid } from "@/lib/ops-shared";
import { brusselsToday } from "@/lib/day";
import {
  APPROVAL_KINDS, NO_CONTACT, PROJECT_PHASES, PROSPECT_STATUSES, checkOutbound, newBotKey, parseBatchJson,
  parseProspectsCsv, plainify, sendBlocker, sha256Hex, type ApprovalKind, type ApprovalStatus, type FilterIssue,
  type ProjectPhase, type Prospect, type ProspectStatus,
} from "@/lib/outreach";

type Sql = Awaited<ReturnType<typeof db>>;

export type Approval = {
  id: string; kind: ApprovalKind; status: ApprovalStatus; projectId: string | null; prospectNr: number | null;
  quoteId: string | null; invoiceId: string | null; recipient: string; subject: string; body: string; originalBody: string;
  issues: FilterIssue[]; createdBy: string; decidedBy: string; decidedAt: string | null; sentAt: string | null; createdAt: string;
};
export type BotKey = { id: string; name: string; grokBotId: string; scope: "sales" | "project"; projectId: string | null; hint: string; active: boolean; lastUsedAt: string | null };
export type AuditEntry = { id: string; actor: string; action: string; object: string; objectId: string; detail: string; approvedBy: string; at: string };
export type OutreachSettings = { forbiddenNames: string[]; maxPerDay: number; windowFrom: string; windowUntil: string; activityStart: string | null; exemptionThreshold: number };

const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? str(v, 10) : null);
const ts = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? str(v, 40) : null);

export async function audit(sql: Sql, userId: string, actor: string, action: string, object = "", objectId = "", detail = "", approvedBy = "") {
  await sql`insert into audit_log (id, user_id, actor, action, object, object_id, detail, approved_by)
    values (${uid()}, ${userId}, ${actor.slice(0, 80)}, ${action.slice(0, 80)}, ${object.slice(0, 40)}, ${objectId.slice(0, 80)}, ${detail.slice(0, 1000)}, ${approvedBy.slice(0, 80)})`;
}

export function mapProspect(r: Record<string, unknown>): Prospect {
  return {
    id: str(r.id, 80), nr: Number(r.nr), bedrijf: str(r.bedrijf, 160), branche: str(r.branche, 80), gemeente: str(r.gemeente, 80),
    afstand: str(r.afstand, 40), website: str(r.website, 200), email: str(r.email, 160), telefoon: str(r.telefoon, 40),
    bron: str(r.bron, 300), haakje: str(r.haakje, 400), prioriteit: (["A", "B", "C"].includes(str(r.prioriteit, 1)) ? str(r.prioriteit, 1) : "") as Prospect["prioriteit"],
    opmerking: str(r.opmerking, 600), status: (PROSPECT_STATUSES.includes(str(r.status, 24) as ProspectStatus) ? str(r.status, 24) : "nieuw") as ProspectStatus,
    statusNote: str(r.status_note, 400), sentOn: day(r.sent_on), batch: r.batch == null ? null : Number(r.batch), lastContactOn: day(r.last_contact_on),
  };
}

export function mapApproval(r: Record<string, unknown>): Approval {
  const issues = typeof r.issues === "string" ? JSON.parse(r.issues) : r.issues;
  return {
    id: str(r.id, 80), kind: str(r.kind, 16) as ApprovalKind, status: str(r.status, 24) as ApprovalStatus,
    projectId: r.project_id ? str(r.project_id, 80) : null, prospectNr: r.prospect_nr == null ? null : Number(r.prospect_nr),
    quoteId: r.quote_id ? str(r.quote_id, 80) : null, invoiceId: r.invoice_id ? str(r.invoice_id, 80) : null, recipient: str(r.recipient, 160), subject: str(r.subject, 200),
    body: str(r.body, 8000), originalBody: str(r.original_body, 8000), issues: Array.isArray(issues) ? issues : [],
    createdBy: str(r.created_by, 80), decidedBy: str(r.decided_by, 80), decidedAt: ts(r.decided_at), sentAt: ts(r.sent_at), createdAt: ts(r.created_at) ?? "",
  };
}

export async function readOutreachSettings(sql: Sql, userId: string): Promise<OutreachSettings> {
  const rows = await sql<Record<string, unknown>>`select * from outreach_settings where user_id = ${userId}`;
  const r = rows[0] ?? {};
  return {
    forbiddenNames: str(r.forbidden_names, 2000).split(/\n|,/).map((s) => s.trim()).filter(Boolean),
    maxPerDay: Number(r.max_per_day ?? 15) || 15,
    windowFrom: str(r.window_from ?? "08:30", 5),
    windowUntil: str(r.window_until ?? "11:00", 5),
    activityStart: day(r.activity_start),
    exemptionThreshold: Number(r.exemption_threshold ?? 25000) || 25000,
  };
}

/** Maakt een goedkeuringsitem aan met filtercontrole. Gedeeld door de UI en de bot-API. */
export async function createApproval(sql: Sql, userId: string, actor: string, input: {
  kind: ApprovalKind; projectId: string | null; prospectNr: number | null; quoteId: string | null; invoiceId?: string | null; recipient: string; subject: string; body: string;
}): Promise<Approval> {
  const settings = await readOutreachSettings(sql, userId);
  if (input.recipient) {
    const blocked = await sql<{ email: string }>`select email from do_not_contact where user_id = ${userId} and email = ${input.recipient.toLowerCase()}`;
    if (blocked[0]) throw new Error("Dit adres staat op de niet-contacteren-lijst.");
  }
  if (input.prospectNr != null) {
    const p = await sql<{ status: string }>`select status from prospects where user_id = ${userId} and nr = ${input.prospectNr}`;
    if (p[0] && NO_CONTACT.includes(p[0].status as ProspectStatus)) throw new Error(`Prospect #${input.prospectNr} mag niet meer gecontacteerd worden (${p[0].status}).`);
  }
  const cold = input.kind === "mail" && input.prospectNr != null;
  const issues = checkOutbound(`${input.subject}\n${input.body}`, { forbiddenNames: settings.forbiddenNames, cold });
  const id = uid();
  await sql`insert into approvals (id, user_id, kind, project_id, prospect_nr, quote_id, invoice_id, recipient, subject, body, original_body, issues, created_by)
    values (${id}, ${userId}, ${input.kind}, ${input.projectId}, ${input.prospectNr}, ${input.quoteId}, ${input.invoiceId ?? null}, ${input.recipient}, ${input.subject},
      ${input.body}, ${input.body}, ${JSON.stringify(issues)}::jsonb, ${actor})`;
  if (input.prospectNr != null) {
    await sql`update prospects set status = ${input.kind === "opvolgmail" ? "opvolging_concept" : "wacht_goedkeuring"}, updated_at = now()
      where user_id = ${userId} and nr = ${input.prospectNr}`;
  }
  await audit(sql, userId, actor, "approval.create", input.kind, id, input.subject);
  const rows = await sql<Record<string, unknown>>`select * from approvals where id = ${id}`;
  return mapApproval(rows[0]);
}

/* ---------- Laden ---------- */

export const loadJam = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const u = context.userId;
    const prospects = (await sql<Record<string, unknown>>`select * from prospects where user_id = ${u} order by nr`).map(mapProspect);
    const approvals = (await sql<Record<string, unknown>>`select * from approvals where user_id = ${u} order by created_at desc limit 300`).map(mapApproval);
    const keys = (await sql<Record<string, unknown>>`select * from bot_keys where user_id = ${u} order by created_at`).map((r): BotKey => ({
      id: str(r.id, 80), name: str(r.name, 80), grokBotId: str(r.grok_bot_id, 80), scope: str(r.scope, 10) === "sales" ? "sales" : "project",
      projectId: r.project_id ? str(r.project_id, 80) : null, hint: str(r.key_hint, 20), active: Boolean(r.active), lastUsedAt: ts(r.last_used_at),
    }));
    const auditRows = (await sql<Record<string, unknown>>`select * from audit_log where user_id = ${u} order by created_at desc limit 300`).map((r): AuditEntry => ({
      id: str(r.id, 80), actor: str(r.actor, 80), action: str(r.action, 80), object: str(r.object, 40), objectId: str(r.object_id, 80),
      detail: str(r.detail, 1000), approvedBy: str(r.approved_by, 80), at: ts(r.created_at) ?? "",
    }));
    const dnc = await sql<{ email: string; reason: string }>`select email, reason from do_not_contact where user_id = ${u} order by email`;
    const batches = await sql<Record<string, unknown>>`select nr, created_on, note from prospect_batches where user_id = ${u} order by nr`;
    const sentToday = await sql<{ n: number }>`select count(*)::int as n from approvals where user_id = ${u} and kind in ('mail','opvolgmail') and sent_at::date = ${brusselsToday()}`;
    return {
      prospects, approvals, keys, audit: auditRows, doNotContact: dnc,
      batches: batches.map((b) => ({ nr: Number(b.nr), createdOn: day(b.created_on) ?? "", note: str(b.note, 400) })),
      settings: await readOutreachSettings(sql, u), sentToday: sentToday[0]?.n ?? 0,
    };
  });

/* ---------- Prospecten ---------- */

export const importProspects = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ csv: String((input as { csv?: string })?.csv ?? "").slice(0, 2_000_000) }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const year = Number(brusselsToday().slice(0, 4));
    const { rows, errors } = parseProspectsCsv(data.csv, year);
    let added = 0, updated = 0;
    for (const r of rows) {
      const existing = await sql<{ id: string }>`select id from prospects where user_id = ${context.userId} and nr = ${r.nr}`;
      if (existing[0]) {
        await sql`update prospects set bedrijf = ${r.bedrijf}, branche = ${r.branche}, gemeente = ${r.gemeente}, afstand = ${r.afstand},
          website = ${r.website}, email = ${r.email}, telefoon = ${r.telefoon}, bron = ${r.bron}, haakje = ${r.haakje}, prioriteit = ${r.prioriteit},
          opmerking = ${r.opmerking}, updated_at = now() where id = ${existing[0].id}`;
        updated++;
      } else {
        await sql`insert into prospects (id, user_id, nr, bedrijf, branche, gemeente, afstand, website, email, telefoon, bron, haakje, prioriteit, opmerking, status, status_note, sent_on, last_contact_on)
          values (${uid()}, ${context.userId}, ${r.nr}, ${r.bedrijf}, ${r.branche}, ${r.gemeente}, ${r.afstand}, ${r.website}, ${r.email}, ${r.telefoon},
            ${r.bron}, ${r.haakje}, ${r.prioriteit}, ${r.opmerking}, ${r.status}, ${r.statusNote}, ${r.sentOn}, ${r.sentOn})`;
        added++;
      }
    }
    await audit(sql, context.userId, "kobe", "prospects.import", "prospect", "", `${added} nieuw, ${updated} bijgewerkt`);
    return { added, updated, errors };
  });

/** Importeert een batch-JSON: zet batchnummer en (optioneel) status verzonden op de prospecten. */
export const importBatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const r = (input ?? {}) as { nr?: number; json?: string; sentOn?: string };
    const nr = Number(r.nr);
    if (!Number.isInteger(nr) || nr <= 0) throw new Error("Batchnummer ontbreekt.");
    return { nr, json: String(r.json ?? "").slice(0, 2_000_000), sentOn: /^\d{4}-\d{2}-\d{2}$/.test(String(r.sentOn)) ? String(r.sentOn) : null };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const mails = parseBatchJson(data.json);
    const u = context.userId;
    await sql`insert into prospect_batches (id, user_id, nr, created_on, note) values (${uid()}, ${u}, ${data.nr}, ${data.sentOn ?? brusselsToday()}, ${`${mails.length} mails`})
      on conflict (user_id, nr) do update set created_on = excluded.created_on, note = excluded.note`;
    for (const m of mails) {
      if (data.sentOn) {
        await sql`update prospects set batch = ${data.nr}, status = case when status in ('nieuw','concept','wacht_goedkeuring') then 'verzonden' else status end,
          sent_on = coalesce(sent_on, ${data.sentOn}), last_contact_on = ${data.sentOn}, updated_at = now() where user_id = ${u} and nr = ${m.nr}`;
      } else {
        await sql`update prospects set batch = ${data.nr}, updated_at = now() where user_id = ${u} and nr = ${m.nr}`;
      }
    }
    await audit(sql, u, "kobe", "batch.import", "batch", String(data.nr), `${mails.length} mails`);
    return { count: mails.length };
  });

export const setProspect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const r = (input ?? {}) as Partial<{ nr: number; status: string; note: string; bedrijf: string; prioriteit: string }>;
    const status = str(r.status, 24) as ProspectStatus;
    if (!PROSPECT_STATUSES.includes(status)) throw new Error("Ongeldige status.");
    return { nr: Number(r.nr), status, note: str(r.note, 400), bedrijf: str(r.bedrijf, 160), prioriteit: ["A", "B", "C"].includes(str(r.prioriteit, 1)) ? str(r.prioriteit, 1) : null };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const u = context.userId;
    await applyProspectStatus(sql, u, data.nr, data.status, data.note);
    if (data.bedrijf) await sql`update prospects set bedrijf = ${data.bedrijf} where user_id = ${u} and nr = ${data.nr}`;
    if (data.prioriteit) await sql`update prospects set prioriteit = ${data.prioriteit} where user_id = ${u} and nr = ${data.nr}`;
    await audit(sql, u, "kobe", "prospect.status", "prospect", String(data.nr), `${data.status} ${data.note}`.trim());
    return { ok: true as const };
  });

export async function applyProspectStatus(sql: Sql, u: string, nr: number, status: ProspectStatus, note: string) {
  const rows = await sql<{ email: string }>`update prospects set status = ${status}, status_note = ${note}, updated_at = now()
    where user_id = ${u} and nr = ${nr} returning email`;
  if (!rows[0]) throw new Error(`Prospect #${nr} niet gevonden.`);
  const email = rows[0].email;
  if (email && (status === "afgemeld" || status === "bounce")) {
    await sql`insert into do_not_contact (user_id, email, reason) values (${u}, ${email}, ${status === "bounce" ? `bounce #${nr}` : `afgemeld #${nr}`})
      on conflict (user_id, email) do nothing`;
  }
}

export const addDoNotContact = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const r = (input ?? {}) as { email?: string; reason?: string; remove?: boolean };
    const email = str(r.email, 160).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !/^@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Geef een e-mailadres of @domein.");
    return { email, reason: str(r.reason, 200), remove: Boolean(r.remove) };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    if (data.remove) await sql`delete from do_not_contact where user_id = ${context.userId} and email = ${data.email}`;
    else await sql`insert into do_not_contact (user_id, email, reason) values (${context.userId}, ${data.email}, ${data.reason}) on conflict (user_id, email) do update set reason = excluded.reason`;
    await audit(sql, context.userId, "kobe", data.remove ? "dnc.remove" : "dnc.add", "dnc", data.email, data.reason);
    return { ok: true as const };
  });

/** Wist prospecten die 12 maanden niet reageerden (GDPR, §6). */
export const purgeExpiredProspects = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const rows = await sql<{ nr: number }>`delete from prospects where user_id = ${context.userId}
      and status not in ('klant','antwoord_positief') and coalesce(last_contact_on, sent_on) is not null
      and coalesce(last_contact_on, sent_on) <= (current_date - interval '12 months') returning nr`;
    await audit(sql, context.userId, "kobe", "prospects.purge", "prospect", "", `${rows.length} gewist`);
    return { count: rows.length };
  });

/* ---------- Goedkeuringswachtrij ---------- */

export const newApproval = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => validApprovalInput(input))
  .handler(async ({ context, data }) => createApproval(await db(), context.userId, "kobe", data));

export function validApprovalInput(input: unknown) {
  const r = (input ?? {}) as Record<string, unknown>;
  const kind = str(r.kind, 16) as ApprovalKind;
  if (!APPROVAL_KINDS.includes(kind)) throw new Error("Soort moet mail, opvolgmail, offerte, factuur of post zijn.");
  const body = str(r.body, 8000);
  if (!body) throw new Error("Tekst ontbreekt.");
  const nr = r.prospectNr == null || r.prospectNr === "" ? null : Number(r.prospectNr);
  return {
    kind, body, subject: str(r.subject, 200), recipient: str(r.recipient, 160).toLowerCase(),
    projectId: str(r.projectId, 80) || null, prospectNr: nr != null && Number.isInteger(nr) ? nr : null, quoteId: str(r.quoteId, 80) || null,
    invoiceId: str(r.invoiceId, 80) || null,
  };
}

/** Enkel Kobe (de ingelogde eigenaar) beslist. Bij goedkeuring krijgt hij eenmalig een approval-token terug. */
export const decideApproval = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const r = (input ?? {}) as { id?: string; decision?: string; body?: string; subject?: string };
    const decision = str(r.decision, 16);
    if (!["goedkeuren", "wijzigen", "weigeren"].includes(decision)) throw new Error("Ongeldige beslissing.");
    return { id: str(r.id, 80), decision, body: r.body == null ? null : str(r.body, 8000), subject: r.subject == null ? null : str(r.subject, 200) };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const u = context.userId;
    const rows = await sql<Record<string, unknown>>`select * from approvals where id = ${data.id} and user_id = ${u}`;
    if (!rows[0]) throw new Error("Item niet gevonden.");
    const item = mapApproval(rows[0]);
    if (item.status === "verzonden") throw new Error("Al verzonden.");
    if (data.decision === "weigeren") {
      await sql`update approvals set status = 'geweigerd', decided_by = 'kobe', decided_at = now(), approval_token_hash = '' where id = ${data.id}`;
      if (item.prospectNr != null) await sql`update prospects set status = case when sent_on is null then 'nieuw' else 'verzonden' end where user_id = ${u} and nr = ${item.prospectNr}`;
      await audit(sql, u, "kobe", "approval.reject", item.kind, item.id, item.subject, "kobe");
      return { status: "geweigerd" as const, token: null };
    }
    const body = data.body ?? item.body;
    const subject = data.subject ?? item.subject;
    const settings = await readOutreachSettings(sql, u);
    const issues = checkOutbound(`${subject}\n${body}`, { forbiddenNames: settings.forbiddenNames, cold: item.kind === "mail" && item.prospectNr != null });
    const changed = body !== item.body || subject !== item.subject;
    if (data.decision === "wijzigen" && !changed) throw new Error("Er is niets gewijzigd.");
    if (issues.some((i) => i.code === "naam")) throw new Error("Goedkeuren kan niet: de tekst bevat een verboden naam.");
    const token = newBotKey().replace("kade_bot_", "kade_ok_");
    const status: ApprovalStatus = changed ? "gewijzigd" : "goedgekeurd";
    await sql`update approvals set status = ${status}, body = ${body}, subject = ${subject}, issues = ${JSON.stringify(issues)}::jsonb,
      decided_by = 'kobe', decided_at = now(), approval_token_hash = ${await sha256Hex(token)} where id = ${data.id}`;
    await audit(sql, u, "kobe", changed ? "approval.edit_approve" : "approval.approve", item.kind, item.id, subject, "kobe");
    return { status, token };
  });

/**
 * Markeert een goedgekeurd item als verzonden. Zonder geldig approval-token van Kobe kan dit niet.
 * Prospectiemails volgen ook het verzendvenster en de daglimiet.
 */
/**
 * Verbruikt Kobes token. `deliver` (optioneel) verstuurt via de mailverbinding nadat alle regels gecontroleerd zijn
 * en vóór het item als verzonden gemarkeerd wordt: mislukt het versturen, dan blijft alles ongewijzigd.
 */
export async function markSent(sql: Sql, u: string, id: string, token: string, actor: string, now = new Date(), deliver?: (item: Approval) => Promise<void>): Promise<Approval> {
  const rows = await sql<Record<string, unknown>>`select * from approvals where id = ${id} and user_id = ${u}`;
  if (!rows[0]) throw new Error("Item niet gevonden.");
  const item = mapApproval(rows[0]);
  if (item.status !== "goedgekeurd" && item.status !== "gewijzigd") throw new Error("Eerst goedkeuren door Kobe.");
  const hash = str(rows[0].approval_token_hash, 80);
  if (!token || !hash || (await sha256Hex(token)) !== hash) throw new Error("Geen geldig approval-token van Kobe.");
  if (item.kind === "mail" || item.kind === "opvolgmail") {
    const s = await readOutreachSettings(sql, u);
    const sent = await sql<{ n: number }>`select count(*)::int as n from approvals where user_id = ${u} and kind in ('mail','opvolgmail') and sent_at::date = ${brusselsToday()}`;
    if (item.prospectNr != null) {
      const block = sendBlocker(now, sent[0]?.n ?? 0, { maxPerDay: s.maxPerDay, days: [2, 3, 4], from: s.windowFrom, until: s.windowUntil });
      if (block) throw new Error(block);
    }
    if (item.recipient) {
      const dup = await sql<{ id: string }>`select id from approvals where user_id = ${u} and recipient = ${item.recipient} and kind = ${item.kind} and sent_at is not null`;
      if (dup[0]) throw new Error(item.kind === "opvolgmail" ? "Er ging al een opvolgmail naar dit adres: stoppen." : "Deze ontvanger kreeg al een mail.");
    }
  }
  if (deliver) await deliver(item);
  const claimed = await sql<{ id: string }>`update approvals set status = 'verzonden', sent_at = now(), approval_token_hash = ''
    where id = ${id} and user_id = ${u} and status in ('goedgekeurd','gewijzigd') returning id`;
  if (!claimed[0]) throw new Error("Al verzonden.");
  const today = brusselsToday();
  if (item.prospectNr != null) {
    await sql`update prospects set status = ${item.kind === "opvolgmail" ? "opgevolgd" : "verzonden"},
      sent_on = coalesce(sent_on, ${today}), last_contact_on = ${today}, updated_at = now() where user_id = ${u} and nr = ${item.prospectNr}`;
  }
  if (item.kind === "offerte" && item.quoteId) {
    await sql`update quotes set status = 'verstuurd' where id = ${item.quoteId} and user_id = ${u} and status = 'concept'`;
  }
  // Factuurstatus/boeking blijft bij de factuurmodule (Verstuur/Peppol); hier enkel de mail.
  await audit(sql, u, actor, "approval.sent", item.kind, item.id, `${item.recipient} ${item.subject}`.trim(), "kobe");
  return { ...item, status: "verzonden" };
}

export const markApprovalSent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: str((input as { id?: string })?.id, 80), token: str((input as { token?: string })?.token, 120) }))
  .handler(async ({ context, data }) => markSent(await db(), context.userId, data.id, data.token, "kobe"));

export const fixPlainText = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => String((input as { text?: string })?.text ?? "").slice(0, 8000))
  .handler(async ({ data }) => ({ text: plainify(data) }));

/* ---------- Bot-sleutels ---------- */

export const createBotKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const r = (input ?? {}) as { name?: string; grokBotId?: string; scope?: string; projectId?: string };
    const name = str(r.name, 80);
    if (!name) throw new Error("Geef de bot een naam.");
    const scope = r.scope === "sales" ? "sales" : "project";
    const projectId = str(r.projectId, 80) || null;
    if (scope === "project" && !projectId) throw new Error("Een projectbot hoort bij één project.");
    return { name, grokBotId: str(r.grokBotId, 80), scope, projectId: scope === "project" ? projectId : null };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    if (data.projectId) {
      const p = await sql<{ id: string }>`select id from projects where id = ${data.projectId} and user_id = ${context.userId}`;
      if (!p[0]) throw new Error("Project niet gevonden.");
    }
    const key = newBotKey();
    const id = uid();
    await sql`insert into bot_keys (id, user_id, name, grok_bot_id, scope, project_id, key_hash, key_hint)
      values (${id}, ${context.userId}, ${data.name}, ${data.grokBotId}, ${data.scope}, ${data.projectId}, ${await sha256Hex(key)}, ${`…${key.slice(-4)}`})`;
    if (data.projectId) await sql`update projects set bot_id = ${data.grokBotId || id} where id = ${data.projectId} and user_id = ${context.userId}`;
    await audit(sql, context.userId, "kobe", "botkey.create", "bot", id, `${data.name} (${data.scope})`);
    return { id, key };
  });

export const revokeBotKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => str((input as { id?: string })?.id, 80))
  .handler(async ({ context, data }) => {
    const sql = await db();
    await sql`update bot_keys set active = false where id = ${data} and user_id = ${context.userId}`;
    await audit(sql, context.userId, "kobe", "botkey.revoke", "bot", data);
    return { ok: true as const };
  });

/* ---------- Instellingen ---------- */

export const saveOutreachSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const r = (input ?? {}) as Partial<OutreachSettings> & { forbiddenNames?: string[] | string };
    const hm = (v: unknown, d: string) => (/^\d{2}:\d{2}$/.test(String(v)) ? String(v) : d);
    const names = Array.isArray(r.forbiddenNames) ? r.forbiddenNames.join("\n") : String(r.forbiddenNames ?? "");
    const max = Math.min(50, Math.max(1, Number(r.maxPerDay) || 15));
    const thr = Number(r.exemptionThreshold) || 25000;
    return {
      forbiddenNames: names.slice(0, 2000), maxPerDay: max, windowFrom: hm(r.windowFrom, "08:30"), windowUntil: hm(r.windowUntil, "11:00"),
      activityStart: /^\d{4}-\d{2}-\d{2}$/.test(String(r.activityStart)) ? String(r.activityStart) : null, exemptionThreshold: thr,
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    await sql`insert into outreach_settings (user_id, forbidden_names, max_per_day, window_from, window_until, activity_start, exemption_threshold)
      values (${context.userId}, ${data.forbiddenNames}, ${data.maxPerDay}, ${data.windowFrom}, ${data.windowUntil}, ${data.activityStart}, ${data.exemptionThreshold})
      on conflict (user_id) do update set forbidden_names = excluded.forbidden_names, max_per_day = excluded.max_per_day, window_from = excluded.window_from,
        window_until = excluded.window_until, activity_start = excluded.activity_start, exemption_threshold = excluded.exemption_threshold`;
    await audit(sql, context.userId, "kobe", "settings.outreach", "settings", "", "verzendregels/verboden namen aangepast");
    return { ok: true as const };
  });

export const saveTheme = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => (str((input as { theme?: string })?.theme, 16) === "justaminute" ? "justaminute" : "kade"))
  .handler(async ({ context, data }) => {
    const sql = await db();
    await sql`insert into desk_settings (user_id, theme) values (${context.userId}, ${data}) on conflict (user_id) do update set theme = excluded.theme`;
    return { theme: data };
  });

/* ---------- Projectvelden en "project + klant + bot" ---------- */

export const saveProjectMeta = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const r = (input ?? {}) as Record<string, unknown>;
    const phase = str(r.phase, 30);
    return {
      id: str(r.id, 80), phase: PROJECT_PHASES.includes(phase as ProjectPhase) ? phase : "", confidential: Boolean(r.confidential),
      contacts: str(r.contacts, 1000), nextAction: str(r.nextAction, 400), botId: str(r.botId, 80),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const rows = await sql<{ id: string }>`update projects set phase = ${data.phase}, confidential = ${data.confidential}, contacts = ${data.contacts},
      next_action = ${data.nextAction}, bot_id = ${data.botId} where id = ${data.id} and user_id = ${context.userId} returning id`;
    if (!rows[0]) throw new Error("Project niet gevonden.");
    await audit(sql, context.userId, "kobe", "project.meta", "project", data.id, `fase ${data.phase || "-"}`);
    return { ok: true as const };
  });

/** Eén actie: klant + project + projectbot-sleutel (Kobe wil per klantlead een eigen projectbot). */
export const createLeadProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const r = (input ?? {}) as Record<string, unknown>;
    const clientName = str(r.clientName, 140);
    if (!clientName) throw new Error("Klantnaam ontbreekt.");
    const nr = r.prospectNr == null || r.prospectNr === "" ? null : Number(r.prospectNr);
    return {
      clientName, email: str(r.email, 160), contacts: str(r.contacts, 1000), grokBotId: str(r.grokBotId, 80),
      confidential: Boolean(r.confidential), prospectNr: nr != null && Number.isInteger(nr) ? nr : null, nextAction: str(r.nextAction, 400),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const u = context.userId;
    const clientId = uid();
    await sql`insert into clients (id, user_id, name, email) values (${clientId}, ${u}, ${data.clientName}, ${data.email})`;
    const projectId = uid();
    await sql`insert into projects (id, user_id, name, client_name, status, note, client_id, phase, confidential, contacts, next_action)
      values (${projectId}, ${u}, ${data.clientName}, ${data.clientName}, 'actief', '', ${clientId}, 'lead', ${data.confidential}, ${data.contacts}, ${data.nextAction})`;
    const key = newBotKey();
    const keyId = uid();
    await sql`insert into bot_keys (id, user_id, name, grok_bot_id, scope, project_id, key_hash, key_hint)
      values (${keyId}, ${u}, ${data.clientName}, ${data.grokBotId}, 'project', ${projectId}, ${await sha256Hex(key)}, ${`…${key.slice(-4)}`})`;
    await sql`update projects set bot_id = ${data.grokBotId || keyId} where id = ${projectId}`;
    if (data.prospectNr != null) await sql`update prospects set status = 'klant', project_id = ${projectId}, updated_at = now() where user_id = ${u} and nr = ${data.prospectNr}`;
    await audit(sql, u, "kobe", "lead.convert", "project", projectId, data.clientName);
    return { clientId, projectId, botKey: key };
  });

/* ---------- Inrichting importeren (seed uit een bestand buiten git) ---------- */

type SetupJson = {
  forbiddenNames?: string[];
  activityStart?: string;
  clients?: { name: string; email?: string; vat?: string; address?: string; city?: string }[];
  projects?: { name: string; clientName?: string; confidential?: boolean; phase?: string; contacts?: string; nextAction?: string; note?: string; dueOn?: string }[];
  tasks?: { project?: string; title: string; detail?: string; dueOn?: string; priority?: string }[];
  grokBots?: { name: string; role?: string; grokBotId?: string; scope?: "sales" | "project"; project?: string }[];
};

/**
 * Laadt bedrijfsspecifieke (vertrouwelijke) inrichting vanuit een JSON-bestand dat Nick lokaal bewaart.
 * Zo staat geen klantdata in de publieke repo. Idempotent op naam: bestaande items worden overgeslagen.
 */
export const importSetup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = String((input as { json?: string })?.json ?? "").slice(0, 500_000);
    try { return JSON.parse(raw.replace(/^\uFEFF/, "")) as SetupJson; } catch { throw new Error("Geen geldige JSON."); }
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const u = context.userId;
    const out = { clients: 0, projects: 0, tasks: 0, bots: 0 };
    if (data.forbiddenNames?.length || data.activityStart) {
      const cur = await readOutreachSettings(sql, u);
      const names = [...new Set([...cur.forbiddenNames, ...(data.forbiddenNames ?? [])].map((n) => str(n, 80)).filter(Boolean))].join("\n");
      const start = /^\d{4}-\d{2}-\d{2}$/.test(String(data.activityStart)) ? String(data.activityStart) : cur.activityStart;
      await sql`insert into outreach_settings (user_id, forbidden_names, activity_start) values (${u}, ${names}, ${start})
        on conflict (user_id) do update set forbidden_names = excluded.forbidden_names, activity_start = excluded.activity_start`;
    }
    const clientIds = new Map<string, string>();
    for (const c of data.clients ?? []) {
      const name = str(c.name, 140);
      if (!name) continue;
      const ex = await sql<{ id: string }>`select id from clients where user_id = ${u} and name = ${name}`;
      if (ex[0]) { clientIds.set(name, ex[0].id); continue; }
      const id = uid();
      await sql`insert into clients (id, user_id, name, vat_number, email, address, city) values (${id}, ${u}, ${name}, ${str(c.vat, 32)}, ${str(c.email, 160)}, ${str(c.address, 200)}, ${str(c.city, 80)})`;
      clientIds.set(name, id);
      out.clients++;
    }
    const projectIds = new Map<string, string>();
    for (const p of data.projects ?? []) {
      const name = str(p.name, 140);
      if (!name) continue;
      const ex = await sql<{ id: string }>`select id from projects where user_id = ${u} and name = ${name}`;
      if (ex[0]) { projectIds.set(name, ex[0].id); continue; }
      const id = uid();
      const phase = PROJECT_PHASES.includes(str(p.phase, 30) as ProjectPhase) ? str(p.phase, 30) : "lead";
      const due = /^\d{4}-\d{2}-\d{2}$/.test(String(p.dueOn)) ? String(p.dueOn) : null;
      await sql`insert into projects (id, user_id, name, client_name, status, note, due_on, client_id, phase, confidential, contacts, next_action)
        values (${id}, ${u}, ${name}, ${str(p.clientName, 140)}, 'actief', ${str(p.note, 800)}, ${due}, ${clientIds.get(str(p.clientName, 140)) ?? null},
          ${phase}, ${Boolean(p.confidential)}, ${str(p.contacts, 1000)}, ${str(p.nextAction, 400)})`;
      projectIds.set(name, id);
      out.projects++;
    }
    for (const t of data.tasks ?? []) {
      const title = str(t.title, 180);
      if (!title) continue;
      const pid = t.project ? projectIds.get(str(t.project, 140)) ?? null : null;
      const ex = await sql<{ id: string }>`select id from tasks where user_id = ${u} and title = ${title}`;
      if (ex[0]) continue;
      const due = /^\d{4}-\d{2}-\d{2}$/.test(String(t.dueOn)) ? String(t.dueOn) : null;
      const prio = ["hoog", "normaal", "laag"].includes(String(t.priority)) ? String(t.priority) : "normaal";
      await sql`insert into tasks (id, user_id, project_id, title, detail, kind, cause, priority, status, due_on)
        values (${uid()}, ${u}, ${pid}, ${title}, ${str(t.detail, 800)}, 'todo', 'Inrichting (eigenaar: Kobe)', ${prio}, 'open', ${due})`;
      out.tasks++;
    }
    for (const b of data.grokBots ?? []) {
      const name = str(b.name, 80);
      if (!name) continue;
      const ex = await sql<{ id: string }>`select id from grok_bots where user_id = ${u} and name = ${name}`;
      if (ex[0]) continue;
      const pid = b.scope === "project" && b.project ? projectIds.get(str(b.project, 140)) ?? null : null;
      const id = uid();
      await sql`insert into grok_bots (id, user_id, name, role, grok_bot_id, scope, project_id)
        values (${id}, ${u}, ${name}, ${str(b.role, 400)}, ${str(b.grokBotId, 80)}, ${pid ? "project" : "sales"}, ${pid})`;
      if (pid) await sql`update projects set bot_id = ${str(b.grokBotId, 80) || id} where id = ${pid}`;
      out.bots++;
    }
    await audit(sql, u, "kobe", "setup.import", "setup", "", JSON.stringify(out));
    return out;
  });
