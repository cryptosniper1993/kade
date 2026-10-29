import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requirePermission } from "@/lib/auth/permissions";
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

export const saveDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as Record<string, unknown>;
    const filename = str(row.filename, 180);
    const mime = str(row.mime, 80);
    const dataUrl = String(row.dataUrl ?? "");
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];
    if (!filename || !allowed.includes(mime)) throw new Error("Enkel png, jpg, webp, gif of pdf.");
    if (!dataUrl.startsWith(`data:${mime}`) || dataUrl.length > 1_200_000) {
      throw new Error("Bestand te groot of ongeldig. Houd het onder ongeveer 700 KB.");
    }
    const kind = str(row.kind, 40) || "bon";
    return {
      filename,
      mime,
      dataUrl,
      kind,
      vendor: str(row.vendor, 160),
      docDate: row.docDate ? dateStr(row.docDate) : null,
      amountEur: row.amountEur == null || row.amountEur === "" ? null : num(row.amountEur),
      note: str(row.note, 400),
      clientId: str(row.clientId, 80),
      supplierId: str(row.supplierId, 80),
    };
  })
  .handler(async ({ context, data }) => {
    requirePermission(context, "werk");
    const sql = await db();
    const id = uid();
    let clientId: string | null = null;
    let supplierId: string | null = null;
    if (data.clientId) {
      const rows = await sql<{ id: string }>`select id from clients where id = ${data.clientId} and user_id = ${context.userId}`;
      if (!rows[0]) throw new Error("Klant niet gevonden.");
      clientId = data.clientId;
    }
    if (data.supplierId) {
      const rows = await sql<{ id: string }>`select id from suppliers where id = ${data.supplierId} and user_id = ${context.userId}`;
      if (!rows[0]) throw new Error("Leverancier niet gevonden.");
      supplierId = data.supplierId;
    }
    await sql`
      insert into documents (id, user_id, filename, mime, kind, vendor, doc_date, amount_eur, note, data_url, demo, client_id, supplier_id)
      values (
        ${id}, ${context.userId}, ${data.filename}, ${data.mime}, ${data.kind}, ${data.vendor},
        ${data.docDate}, ${data.amountEur}, ${data.note}, ${data.dataUrl}, false, ${clientId}, ${supplierId}
      )`;
    return { id };
  });

export const getDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => str((input as { id?: string })?.id, 80))
  .handler(async ({ context, data: id }) => {
    const sql = await db();
    const rows = await sql<{ data_url: string; mime: string; filename: string }>`
      select data_url, mime, filename from documents where id = ${id} and user_id = ${context.userId}`;
    if (!rows[0]) throw new Error("Document niet gevonden.");
    return rows[0];
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => str((input as { id?: string })?.id, 80))
  .handler(async ({ context, data: id }) => {
    requirePermission(context, "werk");
    const sql = await db();
    await sql`delete from documents where id = ${id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const seedDemo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    requirePermission(context, "beheer");
    const sql = await db();
    const userId = context.userId;
    const existing = await sql<{ n: number }>`select count(*)::int as n from journals where user_id = ${userId} and demo = true`;
    if ((existing[0]?.n ?? 0) > 0) return { ok: true as const, already: true };
    const companies = await sql`select user_id from companies where user_id = ${userId}`;
    if (!companies[0]) {
      await sql`
        insert into companies (
          user_id, name, legal_form, vat_number, enterprise_number, address, city, email, iban, vat_regime, year_end_month
        ) values (
          ${userId}, 'Noorderlicht IT', 'bv', 'BE0123456789', '0123.456.789',
          'Kattendijkdok 18', '2000 Antwerpen', 'hello@noorderlicht.example', 'BE68 5390 0754 7034',
          'quarterly', 12
        )`;
    }
    const year = new Date().getFullYear();
    const clients = [
      ["Schelde Logistics", "BE0456789012", "Kaai 12, 2000 Antwerpen"],
      ["Atelier Voss", "BE0567890123", "Nationalestraat 40, 2000 Antwerpen"],
      ["Havenlicht", "BE0678901234", "Londonstraat 9, 2000 Antwerpen"],
    ];
    const clientIds: string[] = [];
    for (const [name, vat, address] of clients) {
      const id = uid();
      clientIds.push(id);
      await sql`
        insert into clients (id, user_id, name, vat_number, email, address, city, demo)
        values (${id}, ${userId}, ${name}, ${vat}, '', ${address}, 'Antwerpen', true)`;
    }
    const invoices: { client: number; number: string; date: string; due: string; status: string; desc: string; ex: number }[] = [
      { client: 0, number: `K-${year}-001`, date: `${year}-02-12`, due: `${year}-03-14`, status: "paid", desc: "Integratie WMS-koppeling", ex: 4800 },
      { client: 1, number: `K-${year}-002`, date: `${year}-04-03`, due: `${year}-05-03`, status: "paid", desc: "Interne tool voor planning", ex: 2500 },
      { client: 2, number: `K-${year}-003`, date: `${year}-06-18`, due: `${year}-07-18`, status: "paid", desc: "Platformretainer, tweede kwartaal", ex: 18000 },
      { client: 0, number: `K-${year}-004`, date: `${year}-09-02`, due: `${year}-09-20`, status: "sent", desc: "Onderhoud en kleine wijzigingen", ex: 1800 },
    ];
    for (const inv of invoices) {
      const id = uid();
      const vat = round2(inv.ex * 0.21);
      const lines = [{ description: inv.desc, qty: 1, unitExVat: inv.ex, vatRate: 21 }];
      await sql`
        insert into invoices (
          id, user_id, number, client_id, client_name, client_vat, client_address,
          issue_date, due_date, status, notes, lines, demo
        ) values (
          ${id}, ${userId}, ${inv.number}, ${clientIds[inv.client]}, ${clients[inv.client][0]},
          ${clients[inv.client][1]}, ${clients[inv.client][2]}, ${inv.date}, ${inv.due}, ${inv.status},
          'Demoboekjaar', ${JSON.stringify(lines)}::jsonb, true
        )`;
      const incl = round2(inv.ex + vat);
      await insertJournal(sql, userId, inv.date, `Factuur ${inv.number}`, "invoice", `inv:${id}:issue`, true, [
        { account: "4000", label: "Klant", debit: incl, credit: 0 },
        { account: "7000", label: "Omzet", debit: 0, credit: inv.ex },
        { account: "4510", label: "Btw", debit: 0, credit: vat },
      ]);
      if (inv.status === "paid") {
        await insertJournal(sql, userId, inv.due, `Ontvangst ${inv.number}`, "invoice", `inv:${id}:pay`, true, [
          { account: "5500", label: "Bank", debit: incl, credit: 0 },
          { account: "4000", label: "Klant", debit: 0, credit: incl },
        ]);
      }
    }
    await insertJournal(sql, userId, `${year}-01-08`, "Inbreng starter", "manual", "demo:capital", true, [
      { account: "5500", label: "Bank", debit: 10000, credit: 0 },
      { account: "1000", label: "Inbreng", debit: 0, credit: 10000 },
    ]);
    const costs: { date: string; memo: string; account: string; ex: number }[] = [
      { date: `${year}-02-02`, memo: "Cloud en licenties", account: "6110", ex: 186 },
      { date: `${year}-03-21`, memo: "Laptop voor ontwikkeling", account: "6120", ex: 1640 },
      { date: `${year}-05-14`, memo: "Campagne lancering", account: "6140", ex: 640 },
      { date: `${year}-08-01`, memo: "Bezoldiging bestuurder, deels", account: "6200", ex: 2500 },
    ];
    for (const cost of costs) {
      if (cost.account === "6200") {
        await insertJournal(sql, userId, cost.date, cost.memo, "manual", "", true, [
          { account: "6200", label: "Bezoldiging", debit: cost.ex, credit: 0 },
          { account: "5500", label: "Bank", debit: 0, credit: cost.ex },
        ]);
      } else {
        const vat = round2(cost.ex * 0.21);
        await insertJournal(sql, userId, cost.date, cost.memo, "manual", "", true, [
          { account: cost.account, label: accountName(cost.account), debit: cost.ex, credit: 0 },
          { account: "4110", label: "Btw", debit: vat, credit: 0 },
          { account: "5500", label: "Bank", debit: 0, credit: round2(cost.ex + vat) },
        ]);
      }
    }
    await insertJournal(sql, userId, `${year}-07-10`, "Voorafbetaling VA2", "manual", "demo:prepay", true, [
      { account: "4120", label: "Voorafbetaling", debit: 1500, credit: 0 },
      { account: "5500", label: "Bank", debit: 0, credit: 1500 },
    ]);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
      <rect width="640" height="420" fill="#f3eee4"/>
      <rect x="28" y="28" width="584" height="364" fill="none" stroke="#10130f" stroke-width="2"/>
      <text x="48" y="78" font-family="Georgia" font-size="28" fill="#10130f">BON · Cloudwerf</text>
      <text x="48" y="112" font-family="sans-serif" font-size="14" fill="#10130f">Licenties ${year}-02-02</text>
      <text x="48" y="180" font-family="sans-serif" font-size="16" fill="#10130f">Werkpleklicenties, 3 zetels</text>
      <text x="48" y="250" font-family="Georgia" font-size="32" fill="#10130f">186,00 EUR + btw</text>
      <text x="48" y="320" font-family="sans-serif" font-size="13" fill="#5c574c">Demodocument. Geen echte aankoop.</text>
    </svg>`;
    await sql`
      insert into documents (id, user_id, filename, mime, kind, vendor, doc_date, amount_eur, note, data_url, demo)
      values (
        ${uid()}, ${userId}, 'bon-cloudwerf.svg', 'image/svg+xml', 'bon', 'Cloudwerf',
        ${`${year}-02-02`}, 186, 'Demobon', ${`data:image/svg+xml,${encodeURIComponent(svg)}`}, true
      )`;
    const personId = uid();
    const projectId = uid();
    await sql`
      insert into people (id, user_id, name, role, active)
      values (${personId}, ${userId}, 'Nick', 'Zaakvoerder', true)`;
    await sql`
      insert into projects (id, user_id, name, client_name, status, note, due_on)
      values (${projectId}, ${userId}, 'Onderhoud Havenlicht', 'Havenlicht', 'actief', 'Demoproject', null)`;
    await sql`
      insert into tasks (id, user_id, project_id, assignee_id, title, detail, kind, cause, priority, status, due_on)
      values (
        ${uid()}, ${userId}, ${projectId}, ${personId}, 'Offerte Havenlicht nabellen', '',
        'todo', '', 'hoog', 'open', ${brusselsToday()}
      )`;
    return { ok: true as const, already: false };
  });

export const clearDemo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    requirePermission(context, "beheer");
    const sql = await db();
    const userId = context.userId;
    const demoJournals = await sql<{ id: string }>`select id from journals where user_id = ${userId} and demo = true`;
    for (const row of demoJournals) {
      await sql`delete from journal_lines where journal_id = ${row.id} and user_id = ${userId}`;
    }
    await sql`delete from journals where user_id = ${userId} and demo = true`;
    await sql`delete from invoices where user_id = ${userId} and demo = true`;
    await sql`delete from clients where user_id = ${userId} and demo = true`;
    await sql`delete from documents where user_id = ${userId} and demo = true`;
    return { ok: true as const };
  });

