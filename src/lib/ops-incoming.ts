/**
 * Inkomende facturen (aankoopfacturen): ophalen via de Peppol-provider of manueel UBL opladen,
 * bewaren (ontdubbeld per leverancier + nummer), status opvolgen, boeken en als betaald markeren.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requirePermission } from "@/lib/auth/permissions";
import { dateStr, db, hasRef, insertJournal, str, uid } from "@/lib/ops-shared";
import { adapter, NOT_CONNECTED } from "@/lib/peppol-adapter.server";
import { accountName, isKnownAccount } from "@/lib/accounts";
import { brusselsToday } from "@/lib/day";
import {
  INCOMING_STATUSES,
  canMoveIncoming,
  dedupeKey,
  incomingJournalLines,
  parseIncomingUbl,
  type IncomingInvoice,
  type IncomingStatus,
  type ParsedIncoming,
} from "@/lib/incoming";

type Sql = Awaited<ReturnType<typeof db>>;
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const json = <T,>(v: unknown, fallback: T): T => {
  if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fallback; } }
  return (v as T) ?? fallback;
};

function mapIncoming(row: Record<string, unknown>): IncomingInvoice {
  const status = str(row.status, 16) as IncomingStatus;
  return {
    id: str(row.id, 80),
    kind: str(row.kind, 16) === "creditnote" ? "creditnote" : "invoice",
    source: str(row.source, 16) === "peppol" ? "peppol" : "upload",
    providerRef: str(row.provider_ref, 200),
    number: str(row.number, 80),
    issueDate: str(row.issue_date, 10),
    dueDate: str(row.due_date, 10),
    currency: str(row.currency, 3),
    supplierId: row.supplier_id ? str(row.supplier_id, 80) : null,
    supplierName: str(row.supplier_name, 200),
    supplierVat: str(row.supplier_vat, 40),
    supplierPeppolId: str(row.supplier_peppol_id, 80),
    supplierAddress: str(row.supplier_address, 300),
    supplierIban: str(row.supplier_iban, 40),
    paymentReference: str(row.payment_reference, 80),
    buyerName: str(row.buyer_name, 200),
    buyerPeppolId: str(row.buyer_peppol_id, 80),
    notes: str(row.notes, 2000),
    lines: json(row.lines, []),
    vat: json(row.vat, []),
    totalExVat: n(row.total_ex_vat),
    totalVat: n(row.total_vat),
    totalInclVat: n(row.total_incl_vat),
    payable: n(row.payable),
    status: INCOMING_STATUSES.includes(status) ? status : "nieuw",
    booked: Boolean(row.booked),
    paidOn: str(row.paid_on, 10),
    hasPdf: Boolean(row.has_pdf),
    pdfName: str(row.pdf_name, 200),
    receivedAt: row.received_at instanceof Date ? row.received_at.toISOString() : str(row.received_at, 40),
  };
}

async function matchSupplier(sql: Sql, userId: string, p: ParsedIncoming): Promise<string | null> {
  const digits = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "");
  const want = digits(p.supplierVat) || digits(p.supplierPeppolId.split(":")[1] ?? "");
  const rows = await sql<{ id: string; vat_number: string; name: string }>`select id, vat_number, name from suppliers where user_id = ${userId}`;
  const hit = rows.find((r) => want && digits(r.vat_number) === want) ?? rows.find((r) => r.name.trim().toLowerCase() === p.supplierName.trim().toLowerCase());
  return hit?.id ?? null;
}

/** Bewaart één UBL. Geeft created=false als dezelfde leverancier+nummer er al is. */
async function store(sql: Sql, userId: string, xml: string, source: "peppol" | "upload", ref: string) {
  const p = parseIncomingUbl(xml);
  const key = dedupeKey(p);
  const existing = await sql<{ id: string }>`select id from incoming_invoices where user_id = ${userId} and dedupe_key = ${key}`;
  if (existing[0]) return { created: false, id: existing[0].id, number: p.number, supplier: p.supplierName };
  const id = uid();
  const supplierId = await matchSupplier(sql, userId, p);
  await sql`
    insert into incoming_invoices (id, user_id, dedupe_key, kind, source, provider_ref, number, issue_date, due_date, currency,
      supplier_id, supplier_name, supplier_vat, supplier_peppol_id, supplier_address, supplier_iban, payment_reference,
      buyer_name, buyer_peppol_id, notes, lines, vat, total_ex_vat, total_vat, total_incl_vat, payable, pdf_name, pdf_base64, xml)
    values (${id}, ${userId}, ${key}, ${p.kind}, ${source}, ${ref.slice(0, 200)}, ${p.number.slice(0, 80)}, ${p.issueDate.slice(0, 10)},
      ${p.dueDate.slice(0, 10)}, ${p.currency.slice(0, 3)}, ${supplierId}, ${p.supplierName.slice(0, 200)}, ${p.supplierVat.slice(0, 40)},
      ${p.supplierPeppolId.slice(0, 80)}, ${p.supplierAddress.slice(0, 300)}, ${p.supplierIban.slice(0, 40)}, ${p.paymentReference.slice(0, 80)},
      ${p.buyerName.slice(0, 200)}, ${p.buyerPeppolId.slice(0, 80)}, ${p.notes.slice(0, 2000)}, ${JSON.stringify(p.lines)}::jsonb,
      ${JSON.stringify(p.vat)}::jsonb, ${p.totalExVat}, ${p.totalVat}, ${p.totalInclVat}, ${p.payable},
      ${p.pdf?.filename.slice(0, 200) ?? ""}, ${p.pdf?.base64 ?? ""}, ${xml})`;
  return { created: true, id, number: p.number, supplier: p.supplierName };
}

export const loadIncoming = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const rows = await sql<Record<string, unknown>>`
      select id, kind, source, provider_ref, number, issue_date, due_date, currency, supplier_id, supplier_name, supplier_vat,
        supplier_peppol_id, supplier_address, supplier_iban, payment_reference, buyer_name, buyer_peppol_id, notes, lines, vat,
        total_ex_vat, total_vat, total_incl_vat, payable, status, booked, paid_on, pdf_name, (pdf_base64 <> '') as has_pdf, received_at
      from incoming_invoices where user_id = ${context.userId} order by received_at desc`;
    return rows.map(mapIncoming);
  });

export const uploadIncoming = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const xml = String((input as { xml?: unknown })?.xml ?? "");
    if (!xml.trim()) throw new Error("Kies een UBL XML-bestand.");
    if (xml.length > 15_000_000) throw new Error("Bestand te groot (max. 15 MB).");
    return xml;
  })
  .handler(async ({ context, data }) => {
    requirePermission(context, "werk");
    const sql = await db();
    const r = await store(sql, context.userId, data, "upload", "");
    return { ...r, message: r.created ? `Factuur ${r.number} van ${r.supplier} toegevoegd.` : `Factuur ${r.number} van ${r.supplier} stond er al.` };
  });

export const pollIncoming = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    requirePermission(context, "peppol");
    const a = adapter();
    if (!a) return { ok: false as const, message: NOT_CONNECTED, created: 0, skipped: 0, failed: 0 };
    const sql = await db();
    let created = 0, skipped = 0, failed = 0;
    const errors: string[] = [];
    let ids: string[];
    try {
      ids = await a.inbox();
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Inbox ophalen mislukt.", created, skipped, failed };
    }
    for (const docId of ids) {
      try {
        const xml = await a.fetchDocument(docId);
        const r = await store(sql, context.userId, xml, "peppol", docId);
        if (r.created) created++; else skipped++;
        await a.ack(docId).catch(() => undefined);
      } catch (error) {
        failed++;
        errors.push(`${docId}: ${error instanceof Error ? error.message : "onleesbaar"}`);
      }
    }
    const parts = [`${created} nieuw`, `${skipped} al gekend`];
    if (failed) parts.push(`${failed} mislukt (${errors.slice(0, 3).join("; ")})`);
    return { ok: failed === 0, message: `Peppol-inbox (${a.provider}): ${parts.join(", ")}.`, created, skipped, failed };
  });

const idOnly = (input: unknown) => {
  const id = str((input as { id?: string })?.id, 80);
  if (!id) throw new Error("Factuur ontbreekt.");
  return id;
};

export const getIncomingFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: idOnly(input), what: (input as { what?: string })?.what === "pdf" ? ("pdf" as const) : ("xml" as const) }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const rows = await sql<Record<string, unknown>>`select number, pdf_name, pdf_base64, xml from incoming_invoices where id = ${data.id} and user_id = ${context.userId}`;
    if (!rows[0]) throw new Error("Factuur niet gevonden.");
    if (data.what === "pdf") {
      if (!rows[0].pdf_base64) throw new Error("Deze factuur heeft geen PDF in de UBL.");
      return { filename: str(rows[0].pdf_name, 200) || `${str(rows[0].number, 80)}.pdf`, mime: "application/pdf", base64: String(rows[0].pdf_base64) };
    }
    return { filename: `${str(rows[0].number, 80) || "factuur"}.xml`, mime: "application/xml", text: String(rows[0].xml) };
  });

export const setIncomingStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const status = str((input as { status?: string })?.status, 16) as IncomingStatus;
    if (!INCOMING_STATUSES.includes(status) || status === "betaald") throw new Error("Ongeldige status.");
    return { id: idOnly(input), status };
  })
  .handler(async ({ context, data }) => {
    requirePermission(context, "peppol");
    const sql = await db();
    const rows = await sql<{ status: string }>`select status from incoming_invoices where id = ${data.id} and user_id = ${context.userId}`;
    if (!rows[0]) throw new Error("Factuur niet gevonden.");
    const from = rows[0].status as IncomingStatus;
    if (!canMoveIncoming(from, data.status)) throw new Error(`Van ${from} naar ${data.status} kan niet.`);
    await sql`update incoming_invoices set status = ${data.status} where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const linkIncomingSupplier = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: idOnly(input), supplierId: str((input as { supplierId?: string })?.supplierId, 80) || null }))
  .handler(async ({ context, data }) => {
    requirePermission(context, "peppol");
    const sql = await db();
    if (data.supplierId) {
      const known = await sql<{ id: string }>`select id from suppliers where id = ${data.supplierId} and user_id = ${context.userId}`;
      if (!known[0]) throw new Error("Leverancier niet gevonden.");
    }
    await sql`update incoming_invoices set supplier_id = ${data.supplierId} where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

/** Boekt de aankoopfactuur in de boeken (kost + btw-aftrek aan leverancier 4400). Eén keer per factuur. */
export const bookIncoming = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const account = str((input as { account?: string })?.account, 8);
    if (!isKnownAccount(account) || !account.startsWith("6")) throw new Error("Kies een kostenrekening.");
    return { id: idOnly(input), account };
  })
  .handler(async ({ context, data }) => {
    requirePermission(context, "boeken");
    const sql = await db();
    const userId = context.userId;
    const rows = await sql<Record<string, unknown>>`select * from incoming_invoices where id = ${data.id} and user_id = ${userId}`;
    if (!rows[0]) throw new Error("Factuur niet gevonden.");
    const inv = mapIncoming(rows[0]);
    if (inv.status === "betwist") throw new Error("Een betwiste factuur boek je niet.");
    const ref = `in:${inv.id}`;
    if (inv.booked || (await hasRef(sql, userId, ref))) throw new Error("Deze factuur is al geboekt.");
    const companies = await sql<{ vat_regime: string }>`select vat_regime from companies where user_id = ${userId}`;
    const exempt = str(companies[0]?.vat_regime, 20) === "exempt";
    const label = (a: string) => (a === "4110" ? "Btw aftrek" : a === "4400" ? "Leverancier" : accountName(a));
    const lines = incomingJournalLines(inv, data.account, exempt).map((l) => ({ ...l, label: label(l.account) }));
    const memo = `${inv.kind === "creditnote" ? "Creditnota" : "Aankoopfactuur"} ${inv.number} — ${inv.supplierName}`.slice(0, 180);
    await insertJournal(sql, userId, inv.issueDate || brusselsToday(), memo, "incoming", ref, false, lines, inv.supplierId);
    await sql`update incoming_invoices set booked = true, status = case when status = 'nieuw' then 'goedgekeurd' else status end
      where id = ${data.id} and user_id = ${userId}`;
    return { ok: true as const };
  });

/** Betaald: status betaald + (als geboekt) betaling leverancier 4400 → bank 5500. */
export const markIncomingPaid = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: idOnly(input), date: dateStr((input as { date?: string })?.date) }))
  .handler(async ({ context, data }) => {
    requirePermission(context, "boeken");
    const sql = await db();
    const userId = context.userId;
    const rows = await sql<Record<string, unknown>>`select * from incoming_invoices where id = ${data.id} and user_id = ${userId}`;
    if (!rows[0]) throw new Error("Factuur niet gevonden.");
    const inv = mapIncoming(rows[0]);
    if (!canMoveIncoming(inv.status, "betaald")) throw new Error(inv.status === "betaald" ? "Al betaald." : "Een betwiste factuur zet je eerst terug op nieuw of goedgekeurd.");
    const ref = `in-pay:${inv.id}`;
    if (inv.booked && !(await hasRef(sql, userId, ref))) {
      const amount = Math.abs(inv.payable || inv.totalInclVat);
      const credit = inv.kind === "creditnote";
      await insertJournal(sql, userId, data.date, `Betaling ${inv.number} — ${inv.supplierName}`.slice(0, 180), "incoming", ref, false, [
        { account: "4400", label: "Leverancier", debit: credit ? 0 : amount, credit: credit ? amount : 0 },
        { account: "5500", label: "Bank", debit: credit ? amount : 0, credit: credit ? 0 : amount },
      ], inv.supplierId);
    }
    await sql`update incoming_invoices set status = 'betaald', paid_on = ${data.date} where id = ${data.id} and user_id = ${userId}`;
    return { ok: true as const, booked: inv.booked };
  });

export const deleteIncoming = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idOnly)
  .handler(async ({ context, data }) => {
    requirePermission(context, "peppol");
    const sql = await db();
    const rows = await sql<{ booked: boolean }>`select booked from incoming_invoices where id = ${data} and user_id = ${context.userId}`;
    if (!rows[0]) return { ok: true as const };
    if (rows[0].booked) throw new Error("Een geboekte factuur verwijder je niet. Zet ze op betwist.");
    await sql`delete from incoming_invoices where id = ${data} and user_id = ${context.userId}`;
    return { ok: true as const };
  });
