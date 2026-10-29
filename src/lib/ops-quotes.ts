import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { asLines, dateStr, db, mapCompany, str, uid } from "@/lib/ops-shared";
import { QUOTE_STATUSES, canMove, conversionBlocker, invoiceDraftFromQuote, nextQuoteNumber, type Quote, type QuoteStatus } from "@/lib/quotes";
import { brusselsToday } from "@/lib/day";

function mapQuote(row: Record<string, unknown>): Quote {
  const status = str(row.status, 16) as QuoteStatus;
  const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : str(v, 10));
  return {
    id: str(row.id, 80),
    number: str(row.number, 40),
    clientId: row.client_id ? str(row.client_id, 80) : null,
    clientName: str(row.client_name, 160),
    clientVat: str(row.client_vat, 32),
    clientAddress: str(row.client_address, 200),
    issueDate: day(row.issue_date),
    validUntil: day(row.valid_until),
    status: QUOTE_STATUSES.includes(status) ? status : "concept",
    notes: str(row.notes, 800),
    lines: asLines(row.lines),
    projectId: row.project_id ? str(row.project_id, 80) : null,
    invoiceId: row.invoice_id ? str(row.invoice_id, 80) : null,
  };
}

export const loadQuotes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const rows = await sql<Record<string, unknown>>`
      select * from quotes where user_id = ${context.userId} order by issue_date desc, number desc`;
    return rows.map(mapQuote);
  });

type QuoteInput = Omit<Quote, "number" | "status" | "invoiceId">;

export const saveQuote = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown): QuoteInput => {
    const row = (input ?? {}) as Partial<QuoteInput>;
    const lines = asLines(row.lines).filter((l) => l.description && l.qty > 0);
    if (!lines.length) throw new Error("Minstens één lijn met omschrijving en aantal.");
    const clientName = str(row.clientName, 160);
    if (!clientName) throw new Error("Zet een klant op de offerte.");
    return {
      id: str(row.id, 80),
      clientId: str(row.clientId, 80) || null,
      clientName,
      clientVat: str(row.clientVat, 32),
      clientAddress: str(row.clientAddress, 200),
      issueDate: dateStr(row.issueDate),
      validUntil: dateStr(row.validUntil),
      notes: str(row.notes, 800),
      lines,
      projectId: str(row.projectId, 80) || null,
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const userId = context.userId;
    const companies = await sql<Record<string, unknown>>`select * from companies where user_id = ${userId}`;
    const exempt = mapCompany(companies[0])?.vatRegime === "exempt";
    const lines = exempt ? data.lines.map((l) => ({ ...l, vatRate: 0 })) : data.lines;
    if (data.id) {
      const existing = await sql<Record<string, unknown>>`select status from quotes where id = ${data.id} and user_id = ${userId}`;
      if (!existing[0]) throw new Error("Offerte niet gevonden.");
      if (str(existing[0].status, 16) === "gefactureerd") throw new Error("Een gefactureerde offerte wijzig je niet meer.");
      await sql`
        update quotes set client_id = ${data.clientId}, client_name = ${data.clientName}, client_vat = ${data.clientVat},
          client_address = ${data.clientAddress}, issue_date = ${data.issueDate}, valid_until = ${data.validUntil},
          notes = ${data.notes}, lines = ${JSON.stringify(lines)}::jsonb, project_id = ${data.projectId}
        where id = ${data.id} and user_id = ${userId}`;
      return { id: data.id };
    }
    const numbers = await sql<{ number: string }>`select number from quotes where user_id = ${userId}`;
    const number = nextQuoteNumber(data.issueDate.slice(0, 4), numbers.map((r) => r.number));
    const id = uid();
    await sql`
      insert into quotes (id, user_id, number, client_id, client_name, client_vat, client_address,
        issue_date, valid_until, status, notes, lines, project_id)
      values (${id}, ${userId}, ${number}, ${data.clientId}, ${data.clientName}, ${data.clientVat}, ${data.clientAddress},
        ${data.issueDate}, ${data.validUntil}, 'concept', ${data.notes}, ${JSON.stringify(lines)}::jsonb, ${data.projectId})`;
    return { id, number };
  });

export const setQuoteStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as { id?: string; status?: string };
    const status = str(row.status, 16) as QuoteStatus;
    if (!QUOTE_STATUSES.includes(status) || status === "gefactureerd") throw new Error("Ongeldige status.");
    return { id: str(row.id, 80), status };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const rows = await sql<Record<string, unknown>>`select status from quotes where id = ${data.id} and user_id = ${context.userId}`;
    if (!rows[0]) throw new Error("Offerte niet gevonden.");
    const from = str(rows[0].status, 16) as QuoteStatus;
    if (!canMove(from, data.status)) throw new Error(`Van ${from} naar ${data.status} kan niet.`);
    await sql`update quotes set status = ${data.status} where id = ${data.id} and user_id = ${context.userId} and status = ${from}`;
    return { ok: true as const };
  });

export const deleteConceptQuote = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => str(typeof input === "string" ? input : (input as { id?: string })?.id, 80))
  .handler(async ({ context, data: id }) => {
    const sql = await db();
    await sql`delete from quotes where id = ${id} and user_id = ${context.userId} and status = 'concept'`;
    return { ok: true as const };
  });

/**
 * Werk gedaan: zet een goedgekeurde offerte om naar een conceptfactuur.
 * De offerte wordt eerst atomair geclaimd (status goedgekeurd → gefactureerd), zodat een dubbele klik
 * of een tweede tabblad nooit een tweede factuur maakt. De factuur volgt dezelfde nummering
 * en kolommen als saveInvoice, en blijft concept zodat "Factuur OK en stuur uit" ze kan versturen.
 */
export const convertQuoteToInvoice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => str(typeof input === "string" ? input : (input as { id?: string })?.id, 80))
  .handler(async ({ context, data: id }) => {
    const sql = await db();
    const userId = context.userId;
    const rows = await sql<Record<string, unknown>>`select * from quotes where id = ${id} and user_id = ${userId}`;
    if (!rows[0]) throw new Error("Offerte niet gevonden.");
    const quote = mapQuote(rows[0]);
    const blocker = conversionBlocker(quote);
    if (blocker) throw new Error(blocker);
    const claimed = await sql<{ id: string }>`
      update quotes set status = 'gefactureerd'
      where id = ${id} and user_id = ${userId} and status = 'goedgekeurd' and invoice_id is null
      returning id`;
    if (!claimed[0]) throw new Error("Deze offerte is al omgezet naar een factuur.");
    try {
      let payDays = 30;
      if (quote.clientId) {
        const c = await sql<Record<string, unknown>>`select * from clients where id = ${quote.clientId} and user_id = ${userId}`;
        const days = Number(c[0]?.pay_days);
        if (Number.isFinite(days) && days > 0) payDays = days;
      }
      const draft = invoiceDraftFromQuote(quote, brusselsToday(), payDays);
      const countRows = await sql<{ n: number }>`select count(*)::int as n from invoices where user_id = ${userId}`;
      const seq = (countRows[0]?.n ?? 0) + 1;
      const number = `K-${draft.issueDate.slice(0, 4)}-${String(seq).padStart(3, "0")}`;
      const invoiceId = uid();
      await sql`
        insert into invoices (
          id, user_id, number, client_id, client_name, client_vat, client_address,
          issue_date, due_date, status, notes, lines, demo
        ) values (
          ${invoiceId}, ${userId}, ${number}, ${draft.clientId}, ${draft.clientName}, ${draft.clientVat}, ${draft.clientAddress},
          ${draft.issueDate}, ${draft.dueDate}, 'draft', ${draft.notes}, ${JSON.stringify(draft.lines)}::jsonb, false
        )`;
      await sql`update quotes set invoice_id = ${invoiceId} where id = ${id} and user_id = ${userId}`;
      return { invoiceId, number };
    } catch (error) {
      await sql`update quotes set status = 'goedgekeurd' where id = ${id} and user_id = ${userId} and invoice_id is null`;
      throw error;
    }
  });
