import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  DEFAULT_BOTS,
  LOOTS,
  SCHAAR,
  asLines,
  contextPack,
  dateStr,
  db,
  grok,
  hasRef,
  insertJournal,
  mapCompany,
  mapMessage,
  mapParty,
  mapSupplier,
  mapVoice,
  num,
  readJournals,
  str,
  uid,
} from "@/lib/ops-shared";
import { accountName, isKnownAccount } from "@/lib/accounts";
import { invoiceTotals, ogmFromSequence } from "@/lib/finance";
import { nextInSeries } from "@/lib/numbering";
import {
  asTreatment,
  effectiveLines,
  formatNumber,
  invoiceProblems,
  legalMention,
  normalizeVat,
  peppolRequired,
  seriesKey,
  type InvoiceKind,
  type VatTreatment,
} from "@/lib/invoicing";
import { round2 } from "@/lib/money";
import { readWork } from "@/lib/work";
import { readFleet } from "@/lib/fleet";
import { brusselsToday } from "@/lib/day";
import { personName, priorityQueue, projectName } from "@/lib/briefing";
import { daysUntil, fleetSnapshot } from "@/lib/assets";
import { clamp, flag } from "@/lib/ops-shared";
import type { Bot, Company, Invoice, InvoiceLine, LegalForm, VatRegime, VoiceSettings } from "@/lib/types";

type InvoiceInput = {
  id: string;
  clientId: string;
  clientName: string;
  clientVat: string;
  clientAddress: string;
  issueDate: string;
  dueDate: string;
  notes: string;
  lines: InvoiceLine[];
  book: boolean;
  b2c: boolean;
  treatment: VatTreatment;
  /** Expliciet akkoord om een Belgische B2B-factuur te boeken zonder Peppol-verzending. */
  skipPeppol: string;
};

type Sql = Awaited<ReturnType<typeof db>>;

/**
 * Concept -> uitgereikt. Het nummer (reeks per jaar) en de OGM worden pas hier toegekend.
 * De statuswissel is de "claim": een tweede gelijktijdige poging vindt geen concept meer.
 */
async function issue(sql: Sql, userId: string, id: string): Promise<{ number: string; ogm: string }> {
  const claimed = await sql<Record<string, unknown>>`
    update invoices set status = 'sent', issued_at = now()
    where id = ${id} and user_id = ${userId} and status = 'draft'
    returning id, kind, credit_of, issue_date::text as issue_date, client_name, lines, vat_treatment`;
  const row = claimed[0];
  if (!row) {
    const done = await sql<Record<string, unknown>>`select number, ogm from invoices where id = ${id} and user_id = ${userId}`;
    return { number: str(done[0]?.number, 40), ogm: str(done[0]?.ogm, 30) };
  }
  const kind: InvoiceKind = str(row.kind, 10) === "credit" ? "credit" : "invoice";
  const issueDate = str(row.issue_date, 10);
  const series = seriesKey(kind, issueDate);
  let number = "";
  let ogm = "";
  try {
    const existing = await sql<{ number: string }>`select number from invoices where user_id = ${userId} and number like ${`${series}-%`}`;
    number = formatNumber(series, await nextInSeries(sql, userId, series, existing.map((r) => r.number)));
    ogm = kind === "invoice" ? ogmFromSequence(await nextInSeries(sql, userId, "ogm")) : "";
    await sql`update invoices set number = ${number}, ogm = ${ogm} where id = ${id} and user_id = ${userId}`;
  } catch (error) {
    await sql`update invoices set status = 'draft', issued_at = null, number = '' where id = ${id} and user_id = ${userId}`;
    throw error;
  }
  const companies = await sql<Record<string, unknown>>`select vat_regime from companies where user_id = ${userId}`;
  const exempt = str(companies[0]?.vat_regime, 20) === "exempt";
  const totals = invoiceTotals(effectiveLines(asLines(row.lines), asTreatment(row.vat_treatment), exempt));
  const client = str(row.client_name, 80);
  const ref = `inv:${id}:issue`;
  if (!(await hasRef(sql, userId, ref))) {
    if (kind === "credit") {
      const of = row.credit_of ? await sql<{ number: string }>`select number from invoices where id = ${str(row.credit_of, 80)} and user_id = ${userId}` : [];
      await insertJournal(sql, userId, issueDate, `Creditnota ${number}${of[0] ? ` op ${of[0].number}` : ""} ${client}`, "invoice", ref, false, [
        { account: "7000", label: "Omzet (creditnota)", debit: totals.ex, credit: 0 },
        ...(totals.vat > 0 ? [{ account: "4510", label: "Btw (creditnota)", debit: totals.vat, credit: 0 }] : []),
        { account: "4000", label: "Klant", debit: 0, credit: totals.incl },
      ]);
    } else {
      await insertJournal(sql, userId, issueDate, `Factuur ${number} ${client}`, "invoice", ref, false, [
        { account: "4000", label: "Klant", debit: totals.incl, credit: 0 },
        { account: "7000", label: "Omzet", debit: 0, credit: totals.ex },
        ...(totals.vat > 0 ? [{ account: "4510", label: "Btw", debit: 0, credit: totals.vat }] : []),
      ]);
    }
  }
  return { number, ogm };
}

export const saveInvoice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown): InvoiceInput => {
    const row = (input ?? {}) as Partial<InvoiceInput>;
    const lines = asLines(row.lines).filter((l) => l.description && l.qty > 0);
    if (!lines.length) throw new Error("Minstens één lijn met omschrijving en aantal.");
    const clientName = str(row.clientName, 160);
    if (!clientName) throw new Error("Zet een klant op de factuur.");
    return {
      id: str(row.id, 80),
      clientId: str(row.clientId, 80),
      clientName,
      clientVat: normalizeVat(str(row.clientVat, 32)),
      clientAddress: str(row.clientAddress, 200),
      issueDate: dateStr(row.issueDate),
      dueDate: dateStr(row.dueDate),
      notes: str(row.notes, 800),
      lines,
      book: Boolean(row.book),
      b2c: Boolean(row.b2c),
      treatment: asTreatment(row.treatment),
      skipPeppol: str(row.skipPeppol, 200),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const userId = context.userId;
    const companies = await sql<Record<string, unknown>>`select * from companies where user_id = ${userId}`;
    const company = mapCompany(companies[0]);
    const exempt = company?.vatRegime === "exempt";
    const treatment: VatTreatment = exempt ? "standard" : data.treatment;
    const lines = effectiveLines(data.lines, treatment, exempt);
    const problems = invoiceProblems({ ...data, lines: data.lines, treatment, exempt }, data.book);
    if (problems.length) throw new Error(problems.join(" "));
    // Wettelijke vermelding (vrijstelling, verlegging, intracommunautair) staat altijd op het stuk.
    const mention = legalMention(treatment, exempt);
    const notes = mention && !data.notes.includes(mention) ? [data.notes, mention].filter(Boolean).join("\n") : data.notes;
    const mustPeppol = data.book && peppolRequired(data.clientVat, data.b2c);
    if (mustPeppol && data.skipPeppol === "pending") {
      // Wordt meteen na boeken via Peppol verstuurd ("Factuur OK en stuur uit").
    } else if (mustPeppol && !data.skipPeppol) {
      throw new Error("PEPPOL_VERPLICHT: Deze klant is een Belgische btw-plichtige. Sinds 1 januari 2026 moet de factuur via Peppol. Gebruik 'Factuur OK en stuur uit', of bevestig dat je ze buiten Kade via Peppol verstuurt.");
    }
    const skipNote = mustPeppol && data.skipPeppol !== "pending" ? data.skipPeppol : "";
    let id = data.id;
    if (id) {
      const existing = await sql<Record<string, unknown>>`
        select id, status from invoices where id = ${id} and user_id = ${userId}`;
      if (!existing[0]) throw new Error("Factuur niet gevonden.");
      if (str(existing[0].status, 12) !== "draft") throw new Error("Een uitgereikte factuur wijzig je niet. Maak er een creditnota op.");
      await sql`
        update invoices set client_id = ${data.clientId || null}, client_name = ${data.clientName},
          client_vat = ${data.clientVat}, client_address = ${data.clientAddress},
          issue_date = ${data.issueDate}, due_date = ${data.dueDate}, notes = ${notes},
          lines = ${JSON.stringify(lines)}::jsonb, b2c = ${data.b2c}, vat_treatment = ${treatment},
          peppol_skipped = ${skipNote}
        where id = ${id} and user_id = ${userId} and status = 'draft'`;
    } else {
      id = uid();
      await sql`
        insert into invoices (
          id, user_id, number, client_id, client_name, client_vat, client_address,
          issue_date, due_date, status, notes, lines, demo, b2c, vat_treatment, peppol_skipped
        ) values (
          ${id}, ${userId}, '', ${data.clientId || null}, ${data.clientName}, ${data.clientVat}, ${data.clientAddress},
          ${data.issueDate}, ${data.dueDate}, 'draft', ${notes}, ${JSON.stringify(lines)}::jsonb, false, ${data.b2c}, ${treatment}, ${skipNote}
        )`;
    }
    if (!data.book) return { id, number: "", ogm: "" };
    const { number, ogm } = await issue(sql, userId, id);
    return { id, number, ogm };
  });

/** Maakt een concept-creditnota op een uitgereikte factuur (standaard het volledige bedrag). */
export const createCreditNote = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = str(typeof input === "string" ? input : (input as { id?: string })?.id, 80);
    if (!id) throw new Error("Factuur ontbreekt.");
    return id;
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const userId = context.userId;
    const rows = await sql<Record<string, unknown>>`select * from invoices where id = ${data} and user_id = ${userId}`;
    const row = rows[0];
    if (!row) throw new Error("Factuur niet gevonden.");
    if (str(row.kind, 10) === "credit") throw new Error("Op een creditnota maak je geen creditnota.");
    if (str(row.status, 12) === "draft") throw new Error("Een concept verwijder of wijzig je gewoon; een creditnota hoort bij een uitgereikte factuur.");
    const open = await sql<{ id: string }>`select id from invoices where user_id = ${userId} and credit_of = ${data} and status = 'draft'`;
    if (open[0]) return { id: open[0].id, created: false };
    const id = uid();
    const today = brusselsToday();
    await sql`
      insert into invoices (
        id, user_id, number, kind, credit_of, client_id, client_name, client_vat, client_address,
        issue_date, due_date, status, notes, lines, demo, b2c, vat_treatment
      ) values (
        ${id}, ${userId}, '', 'credit', ${data}, ${row.client_id ?? null}, ${str(row.client_name, 160)}, ${str(row.client_vat, 32)}, ${str(row.client_address, 200)},
        ${today}, ${today}, 'draft', ${`Creditnota op factuur ${str(row.number, 40)} van ${str(row.issue_date, 10)}.`},
        ${JSON.stringify(asLines(row.lines))}::jsonb, false, ${Boolean(row.b2c)}, ${str(row.vat_treatment, 20) || "standard"}
      )`;
    return { id, created: true };
  });

export const setInvoicePaid = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = str((input as { id?: string })?.id, 80);
    const paidOn = dateStr((input as { paidOn?: string })?.paidOn);
    if (!id) throw new Error("Factuur ontbreekt.");
    return { id, paidOn };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const userId = context.userId;
    const rows = await sql<Record<string, unknown>>`
      select id, number, status, lines, client_name, kind, vat_treatment from invoices where id = ${data.id} and user_id = ${userId}`;
    const row = rows[0];
    if (!row) throw new Error("Factuur niet gevonden.");
    if (str(row.status, 12) === "draft") throw new Error("Boek de factuur eerst als verstuurd.");
    if (str(row.status, 12) === "paid") return { ok: true as const };
    const companies = await sql<Record<string, unknown>>`select vat_regime from companies where user_id = ${userId}`;
    const forceZero = str(companies[0]?.vat_regime, 20) === "exempt";
    const totals = invoiceTotals(effectiveLines(asLines(row.lines), asTreatment(row.vat_treatment), forceZero));
    const credit = str(row.kind, 10) === "credit";
    const ref = `inv:${data.id}:pay`;
    if (credit && !(await hasRef(sql, userId, ref))) {
      await insertJournal(sql, userId, data.paidOn, `Terugbetaling creditnota ${str(row.number, 40)} ${str(row.client_name, 80)}`, "invoice", ref, false, [
        { account: "4000", label: "Klant", debit: totals.incl, credit: 0 },
        { account: "5500", label: "Bank", debit: 0, credit: totals.incl },
      ]);
    } else if (!(await hasRef(sql, userId, ref))) {
      await insertJournal(
        sql,
        userId,
        data.paidOn,
        `Ontvangst ${str(row.number, 40)} ${str(row.client_name, 80)}`,
        "invoice",
        ref,
        false,
        [
          { account: "5500", label: "Bank", debit: totals.incl, credit: 0 },
          { account: "4000", label: "Klant", debit: 0, credit: totals.incl },
        ],
      );
    }
    await sql`update invoices set status = 'paid' where id = ${data.id} and user_id = ${userId}`;
    return { ok: true as const };
  });

export const deleteDraftInvoice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  // De UI stuurt soms een kale string, soms { id }: beide aanvaarden.
  .validator((input: unknown) => str(typeof input === "string" ? input : (input as { id?: string })?.id, 80))
  .handler(async ({ context, data: id }) => {
    if (!id) throw new Error("Factuur ontbreekt.");
    const sql = await db();
    await sql`delete from invoices where id = ${id} and user_id = ${context.userId} and status = 'draft'`;
    return { ok: true as const };
  });

