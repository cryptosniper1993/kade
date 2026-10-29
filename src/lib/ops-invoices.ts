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
};

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
      clientVat: str(row.clientVat, 32),
      clientAddress: str(row.clientAddress, 200),
      issueDate: dateStr(row.issueDate),
      dueDate: dateStr(row.dueDate),
      notes: str(row.notes, 800),
      lines,
      book: Boolean(row.book),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const userId = context.userId;
    const companies = await sql<Record<string, unknown>>`select * from companies where user_id = ${userId}`;
    const company = mapCompany(companies[0]);
    const forceZero = company?.vatRegime === "exempt";
    const lines = forceZero ? data.lines.map((l) => ({ ...l, vatRate: 0 })) : data.lines;
    const totals = invoiceTotals(lines, forceZero);
    let id = data.id;
    let number = "";
    if (id) {
      const existing = await sql<Record<string, unknown>>`
        select id, status, number from invoices where id = ${id} and user_id = ${userId}`;
      if (!existing[0]) throw new Error("Factuur niet gevonden.");
      if (str(existing[0].status, 12) !== "draft") throw new Error("Een geboekte factuur wijzig je niet. Maak een creditnota via een nieuwe boeking.");
      number = str(existing[0].number, 40);
      await sql`
        update invoices set client_id = ${data.clientId || null}, client_name = ${data.clientName},
          client_vat = ${data.clientVat}, client_address = ${data.clientAddress},
          issue_date = ${data.issueDate}, due_date = ${data.dueDate}, notes = ${data.notes},
          lines = ${JSON.stringify(lines)}::jsonb, status = ${data.book ? "sent" : "draft"}
        where id = ${id} and user_id = ${userId}`;
    } else {
      const countRows = await sql<{ n: number }>`select count(*)::int as n from invoices where user_id = ${userId}`;
      const seq = (countRows[0]?.n ?? 0) + 1;
      number = `K-${data.issueDate.slice(0, 4)}-${String(seq).padStart(3, "0")}`;
      id = uid();
      await sql`
        insert into invoices (
          id, user_id, number, client_id, client_name, client_vat, client_address,
          issue_date, due_date, status, notes, lines, demo
        ) values (
          ${id}, ${userId}, ${number}, ${data.clientId || null}, ${data.clientName}, ${data.clientVat}, ${data.clientAddress},
          ${data.issueDate}, ${data.dueDate}, ${data.book ? "sent" : "draft"}, ${data.notes}, ${JSON.stringify(lines)}::jsonb, false
        )`;
    }
    if (data.book) {
      const ref = `inv:${id}:issue`;
      if (!(await hasRef(sql, userId, ref))) {
        const note = forceZero ? "Vrijgesteld van btw (kleine onderneming)." : data.notes;
        await insertJournal(sql, userId, data.issueDate, `Factuur ${number} ${data.clientName}`, "invoice", ref, false, [
          { account: "4000", label: "Klant", debit: totals.incl, credit: 0 },
          { account: "7000", label: "Omzet", debit: 0, credit: totals.ex },
          ...(totals.vat > 0 ? [{ account: "4510", label: "Btw", debit: 0, credit: totals.vat }] : []),
        ]);
        if (note && forceZero) {
          await sql`update invoices set notes = ${note} where id = ${id} and user_id = ${userId} and notes = ''`;
        }
      }
    }
    return { id, number, ogm: ogmFromSequence(Number(number.replace(/\D/g, "")) || 1) };
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
      select id, number, status, lines, client_name from invoices where id = ${data.id} and user_id = ${userId}`;
    const row = rows[0];
    if (!row) throw new Error("Factuur niet gevonden.");
    if (str(row.status, 12) === "draft") throw new Error("Boek de factuur eerst als verstuurd.");
    if (str(row.status, 12) === "paid") return { ok: true as const };
    const companies = await sql<Record<string, unknown>>`select vat_regime from companies where user_id = ${userId}`;
    const forceZero = str(companies[0]?.vat_regime, 20) === "exempt";
    const totals = invoiceTotals(asLines(row.lines), forceZero);
    const ref = `inv:${data.id}:pay`;
    if (!(await hasRef(sql, userId, ref))) {
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
  .validator((input: unknown) => str((input as { id?: string })?.id, 80))
  .handler(async ({ context, data: id }) => {
    const sql = await db();
    await sql`delete from invoices where id = ${id} and user_id = ${context.userId} and status = 'draft'`;
    return { ok: true as const };
  });

