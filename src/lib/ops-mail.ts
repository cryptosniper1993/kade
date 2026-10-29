import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { db, mapCompany, str, uid, asLines, dateStr } from "@/lib/ops-shared";
import { env } from "@/lib/env.server";
import { audit, markSent, type Approval } from "@/lib/ops-jam";
import { buildMime, gmailAuthorizeUrl, isProvider, MAIL_ENV, outlookAuthorizeUrl, safeFilename, validEmail, type Attachment, type MailProvider, type OutgoingMail } from "@/lib/mail";
import { MailError, redirectUri, sendVia, testVia, type MailRow } from "@/lib/mail.server";
import { renderDocPdf } from "@/lib/pdf.server";
type Sql = Awaited<ReturnType<typeof db>>;

/** Mailverbinding (Beheer > Instellingen en #setup). Tokens versleuteld in de DB; nooit naar de browser. */

export interface MailStatus {
  provider: MailProvider;
  fromAddress: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpSecure: boolean;
  connected: boolean;
  account: string;
  envMissing: string[];
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  redirectUri: string;
}

export interface MailLogEntry { id: string; provider: string; recipient: string; subject: string; attachment: string; ref: string; ok: boolean; detail: string; createdAt: string }

export async function readMailRow(sql: Sql, u: string): Promise<MailRow & { account: string; lastTestAt: string | null; lastTestOk: boolean | null }> {
  const r = (await sql<Record<string, unknown>>`select * from mail_settings where user_id = ${u}`)[0];
  return {
    provider: isProvider(r?.provider) ? r.provider : "mailto",
    fromAddress: str(r?.from_address, 160), fromName: str(r?.from_name, 120),
    smtpHost: str(r?.smtp_host, 200), smtpPort: Number(r?.smtp_port ?? 587) || 587, smtpUser: str(r?.smtp_user, 160),
    smtpSecure: r?.smtp_secure === true, tokenEnc: str(r?.token_enc, 20000), account: str(r?.token_account, 160),
    lastTestAt: r?.last_test_at ? new Date(String(r.last_test_at)).toISOString() : null,
    lastTestOk: r?.last_test_ok == null ? null : r.last_test_ok === true,
  };
}

function status(row: Awaited<ReturnType<typeof readMailRow>>): MailStatus {
  const { tokenEnc, ...rest } = row;
  return { ...rest, connected: row.provider === "mailto" || (row.provider === "smtp" ? Boolean(row.smtpHost) : Boolean(tokenEnc)), envMissing: MAIL_ENV[row.provider].filter((k) => !env(k)), redirectUri: redirectUri() };
}

async function log(sql: Sql, u: string, provider: string, m: { to: string; subject: string; attachment?: string; ref?: string }, ok: boolean, detail: string) {
  await sql`insert into mail_log (id, user_id, provider, recipient, subject, attachment, ref, ok, detail)
    values (${uid()}, ${u}, ${provider}, ${m.to.slice(0, 160)}, ${m.subject.slice(0, 200)}, ${(m.attachment ?? "").slice(0, 160)}, ${(m.ref ?? "").slice(0, 80)}, ${ok}, ${detail.slice(0, 500)})`;
}

export const loadMail = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const row = await readMailRow(sql, context.userId);
    const logs = await sql<Record<string, unknown>>`select * from mail_log where user_id = ${context.userId} order by created_at desc limit 50`;
    return {
      status: status(row),
      log: logs.map((l): MailLogEntry => ({ id: String(l.id), provider: String(l.provider), recipient: String(l.recipient), subject: String(l.subject), attachment: String(l.attachment), ref: String(l.ref), ok: l.ok === true, detail: String(l.detail), createdAt: new Date(String(l.created_at)).toISOString() })),
    };
  });

export const saveMail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const r = (input ?? {}) as Record<string, unknown>;
    if (!isProvider(r.provider)) throw new Error("Kies een provider.");
    const fromAddress = str(r.fromAddress, 160).toLowerCase();
    if (fromAddress && !validEmail(fromAddress)) throw new Error("Afzenderadres is geen geldig e-mailadres.");
    const port = Number(r.smtpPort ?? 587);
    return { provider: r.provider, fromAddress, fromName: str(r.fromName, 120), smtpHost: str(r.smtpHost, 200), smtpPort: Number.isInteger(port) && port > 0 && port < 65536 ? port : 587, smtpUser: str(r.smtpUser, 160), smtpSecure: r.smtpSecure === true };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const prev = await readMailRow(sql, context.userId);
    const keepToken = prev.provider === data.provider;
    await sql`insert into mail_settings (user_id, provider, from_address, from_name, smtp_host, smtp_port, smtp_user, smtp_secure, token_enc, token_account, updated_at)
      values (${context.userId}, ${data.provider}, ${data.fromAddress}, ${data.fromName}, ${data.smtpHost}, ${data.smtpPort}, ${data.smtpUser}, ${data.smtpSecure}, '', '', now())
      on conflict (user_id) do update set provider = excluded.provider, from_address = excluded.from_address, from_name = excluded.from_name,
        smtp_host = excluded.smtp_host, smtp_port = excluded.smtp_port, smtp_user = excluded.smtp_user, smtp_secure = excluded.smtp_secure,
        token_enc = ${keepToken ? prev.tokenEnc : ""}, token_account = ${keepToken ? prev.account : ""}, updated_at = now()`;
    await audit(sql, context.userId, "kobe", "mail.settings", "mail", "", data.provider);
    return status(await readMailRow(sql, context.userId));
  });

/** Start OAuth: geeft de autorisatie-URL terug; state wordt server-side bewaard en bij de callback gecontroleerd. */
export const startMailOAuth = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const row = await readMailRow(sql, context.userId);
    if (row.provider !== "outlook" && row.provider !== "gmail") throw new Error("OAuth bestaat enkel voor Outlook en Gmail.");
    const missing = MAIL_ENV[row.provider].filter((k) => !env(k));
    if (missing.length) throw new Error(`Eerst instellen op de server: ${missing.join(", ")}.`);
    const state = `${context.userId.length.toString(36)}.${crypto.randomUUID()}`;
    await sql`update mail_settings set oauth_state = ${state} where user_id = ${context.userId}`;
    const url = row.provider === "outlook"
      ? outlookAuthorizeUrl({ tenant: env("MS_TENANT") ?? "common", clientId: env("MS_CLIENT_ID")!, redirectUri: redirectUri(), state })
      : gmailAuthorizeUrl({ clientId: env("GOOGLE_CLIENT_ID")!, redirectUri: redirectUri(), state });
    return { url };
  });

export const disconnectMail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    await sql`update mail_settings set token_enc = '', token_account = '', oauth_state = '' where user_id = ${context.userId}`;
    await audit(sql, context.userId, "kobe", "mail.disconnect", "mail");
    return { ok: true };
  });

function persistTokens(sql: Sql, u: string) {
  return async (enc: string) => { await sql`update mail_settings set token_enc = ${enc} where user_id = ${u}`; };
}

export const testMail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const row = await readMailRow(sql, context.userId);
    let ok = false; let message: string;
    try { message = await testVia(row, { onTokens: persistTokens(sql, context.userId) }); ok = true; }
    catch (e) { message = e instanceof Error ? e.message : "Test mislukt."; }
    await sql`update mail_settings set last_test_at = now(), last_test_ok = ${ok} where user_id = ${context.userId}`;
    return { ok, message };
  });

async function docAttachment(sql: Sql, u: string, item: Pick<Approval, "quoteId" | "invoiceId">): Promise<Attachment | null> {
  const company = mapCompany((await sql<Record<string, unknown>>`select * from companies where user_id = ${u}`)[0]);
  const exempt = company?.vatRegime === "exempt";
  if (item.invoiceId) {
    const r = (await sql<Record<string, unknown>>`select * from invoices where id = ${item.invoiceId} and user_id = ${u}`)[0];
    if (!r) throw new Error("Factuur niet gevonden.");
    const number = str(r.number, 40);
    const data = await renderDocPdf({ kind: "factuur", number, issueDate: dateStr(r.issue_date), dueLabel: "Vervalt", dueDate: dateStr(r.due_date), clientName: str(r.client_name), clientVat: str(r.client_vat), clientAddress: str(r.client_address), notes: str(r.notes, 2000), lines: asLines(r.lines), company, exempt });
    return { filename: `factuur-${safeFilename(number)}.pdf`, contentType: "application/pdf", data };
  }
  if (item.quoteId) {
    const r = (await sql<Record<string, unknown>>`select * from quotes where id = ${item.quoteId} and user_id = ${u}`)[0];
    if (!r) throw new Error("Offerte niet gevonden.");
    const number = str(r.number, 40);
    const data = await renderDocPdf({ kind: "offerte", number, issueDate: dateStr(r.issue_date), dueLabel: "Geldig tot", dueDate: dateStr(r.valid_until), clientName: str(r.client_name), clientVat: str(r.client_vat), clientAddress: str(r.client_address), notes: str(r.notes, 2000), lines: asLines(r.lines), company, exempt });
    return { filename: `offerte-${safeFilename(number)}.pdf`, contentType: "application/pdf", data };
  }
  return null;
}

function outgoing(row: MailRow, item: Approval, att: Attachment | null): OutgoingMail {
  if (!row.fromAddress) throw new MailError("Afzenderadres ontbreekt in de mailverbinding.");
  if (!item.recipient || !validEmail(item.recipient)) throw new MailError("Ontvanger ontbreekt of is ongeldig.");
  return { from: row.fromAddress, fromName: row.fromName, to: item.recipient, subject: item.subject, body: item.body, attachments: att ? [att] : [] };
}

/** Verstuur een goedgekeurd item via de mailverbinding (met pdf bij factuur/offerte). Vereist Kobes token. */
export const sendApprovalMail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: str((input as { id?: string })?.id, 80), token: str((input as { token?: string })?.token, 120) }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const u = context.userId;
    const row = await readMailRow(sql, u);
    let detail = "";
    let mail: OutgoingMail | null = null;
    try {
      const item = await markSent(sql, u, data.id, data.token, "kobe", new Date(), async (it) => {
        const att = await docAttachment(sql, u, it);
        mail = outgoing(row, it, att);
        detail = await sendVia(row, mail, { onTokens: persistTokens(sql, u) });
        await log(sql, u, row.provider, { to: mail.to, subject: mail.subject, attachment: att?.filename, ref: it.id }, true, detail);
      });
      await audit(sql, u, "kobe", "mail.sent", item.kind, item.id, `${row.provider}: ${item.recipient}`, "kobe");
      return { ok: true, message: detail };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Versturen mislukt.";
      const m = mail as OutgoingMail | null;
      if (m) await log(sql, u, row.provider, { to: m.to, subject: m.subject, ref: data.id }, false, msg);
      throw new Error(msg);
    }
  });

/** .eml (met pdf-bijlage) voor de mailprogramma-fallback. Verstuurt niets en verbruikt geen token. */
export const approvalEml = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => str((input as { id?: string })?.id, 80))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const u = context.userId;
    const r = (await sql<Record<string, unknown>>`select * from approvals where id = ${data} and user_id = ${u}`)[0];
    if (!r) throw new Error("Item niet gevonden.");
    if (!["goedgekeurd", "gewijzigd", "verzonden"].includes(String(r.status))) throw new Error("Eerst goedkeuren door Kobe.");
    const row = await readMailRow(sql, u);
    const item = { quoteId: r.quote_id ? String(r.quote_id) : null, invoiceId: r.invoice_id ? String(r.invoice_id) : null };
    const att = await docAttachment(sql, u, item);
    const eml = buildMime({ from: row.fromAddress || "ik@example.invalid", fromName: row.fromName, to: str(r.recipient, 160), subject: str(r.subject, 200), body: str(r.body, 8000), attachments: att ? [att] : [] });
    return { filename: `${safeFilename(str(r.subject, 60) || "mail")}.eml`, eml: `X-Unsent: 1\r\n${eml}` };
  });

/** Facturen en offertes die je per mail (met pdf) ter goedkeuring kan zetten. */
export const listMailableDocs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const inv = await sql<Record<string, unknown>>`select i.id, i.number, i.client_name, c.email from invoices i left join clients c on c.id = i.client_id and c.user_id = i.user_id where i.user_id = ${context.userId} order by i.issue_date desc limit 60`;
    const q = await sql<Record<string, unknown>>`select q.id, q.number, q.client_name, c.email from quotes q left join clients c on c.id = q.client_id and c.user_id = q.user_id where q.user_id = ${context.userId} order by q.issue_date desc limit 60`;
    const m = (kind: "factuur" | "offerte") => (r: Record<string, unknown>) => ({ kind, id: String(r.id), number: String(r.number), client: String(r.client_name), email: r.email ? String(r.email) : "" });
    return [...inv.map(m("factuur")), ...q.map(m("offerte"))];
  });
