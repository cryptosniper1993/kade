import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  EXEMPT_MENTION, effectiveLines, formatNumber, invoiceProblems, isForeignVat, isValidBeVat, legalMention,
  lineCategory, maxInSeries, normalizeVat, peppolRequired, seriesKey,
} from "./invoicing.ts";
import { nextInSeries } from "./numbering.ts";
import { buildPeppolUbl } from "./peppol.ts";

const line = (vatRate: number) => ({ description: "Werk", qty: 2, unitExVat: 50, vatRate });
const base = { clientVat: "BE0202239951", b2c: false, issueDate: "2026-10-29", dueDate: "2026-11-28", lines: [line(21)], treatment: "standard" as const, exempt: false };

test("btw-nummer: formaat en mod-97", () => {
  assert.equal(isValidBeVat("BE0202.239.951"), true);
  assert.equal(isValidBeVat("BE0202239952"), false);
  assert.equal(isValidBeVat("BE2202239951"), false);
  assert.equal(isForeignVat("NL123456789B01"), true);
  assert.equal(isForeignVat("XX123"), false);
  assert.equal(normalizeVat("0202 239 951"), "BE0202239951");
});

test("validatie: tarieven, vervaldag, B2B", () => {
  assert.deepEqual(invoiceProblems(base, true), []);
  assert.match(invoiceProblems({ ...base, lines: [line(9)] }, true).join(), /9%/);
  assert.match(invoiceProblems({ ...base, dueDate: "2026-10-01" }, true).join(), /vervaldag/);
  assert.match(invoiceProblems({ ...base, clientVat: "" }, true).join(), /btw-nummer van de klant/);
  assert.deepEqual(invoiceProblems({ ...base, clientVat: "", b2c: true }, true), []);
  assert.deepEqual(invoiceProblems({ ...base, clientVat: "" }, false), [], "concept mag zonder btw-nummer");
  assert.match(invoiceProblems({ ...base, treatment: "ic_dienst" }, true).join(), /andere EU-lidstaat/);
  assert.deepEqual(invoiceProblems({ ...base, treatment: "ic_dienst", clientVat: "NL123456789B01" }, true), []);
  assert.match(invoiceProblems({ ...base, treatment: "verlegd", clientVat: "NL123456789B01" }, true).join(), /Belgisch/);
  for (const r of [0, 6, 12, 21]) assert.deepEqual(invoiceProblems({ ...base, lines: [line(r)] }, true), []);
});

test("btw-categorieën en vermeldingen", () => {
  assert.equal(lineCategory(21, "standard", false).id, "S");
  assert.equal(lineCategory(0, "standard", false).id, "Z");
  assert.equal(lineCategory(21, "standard", true).id, "E");
  assert.equal(lineCategory(21, "verlegd", false).id, "AE");
  assert.equal(lineCategory(21, "ic_levering", false).id, "K");
  assert.equal(lineCategory(21, "ic_dienst", false).id, "K");
  assert.equal(EXEMPT_MENTION, "Bijzondere vrijstellingsregeling van belasting");
  assert.match(legalMention("verlegd", false), /^Verlegging van heffing\./);
  assert.match(legalMention("ic_levering", false), /39bis/);
  assert.equal(legalMention("standard", false), "");
  assert.equal(effectiveLines([line(21)], "verlegd", false)[0].vatRate, 0);
  assert.equal(peppolRequired("BE0202239951", false), true);
  assert.equal(peppolRequired("BE0202239951", true), false);
  assert.equal(peppolRequired("NL123456789B01", false), false);
});

test("nummering: reeks per jaar en soort", () => {
  assert.equal(seriesKey("invoice", "2026-03-01"), "K-2026");
  assert.equal(seriesKey("credit", "2027-01-02"), "C-2027");
  assert.equal(formatNumber("K-2026", 7), "K-2026-007");
  assert.equal(maxInSeries(["K-2026-003", "K-2025-009", "K-2026-011", "C-2026-050", "K-2026-002-2"], "K-2026"), 11);
});

test("nextInSeries: atomair, gezaaid, zonder dubbels onder gelijktijdigheid", async () => {
  const pg = new PGlite();
  await pg.exec(readFileSync("migrations/0002_kade.sql", "utf8"));
  await pg.exec("alter table invoices add column if not exists peppol_status text not null default 'concept'");
  await pg.exec(readFileSync("migrations/0013_facturatie.sql", "utf8"));
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    values.forEach((_, i) => (text += `$${i + 1}${strings[i + 1]}`));
    return (await pg.query(text, values)).rows;
  }) as never;
  assert.equal(await nextInSeries(sql, "u1", "K-2026", ["K-2026-004"]), 5);
  const many = await Promise.all(Array.from({ length: 10 }, () => nextInSeries(sql, "u1", "K-2026")));
  assert.deepEqual([...many].sort((a, b) => a - b), [6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  assert.equal(await nextInSeries(sql, "u1", "K-2027"), 1, "nieuw jaar begint opnieuw");
  assert.equal(await nextInSeries(sql, "u2", "K-2026"), 1, "per gebruiker");
  await pg.query("insert into invoices (id,user_id,number,client_name,issue_date,due_date,lines) values ('a','u1','K-2026-001','x','2026-01-01','2026-01-01','[]')");
  await assert.rejects(pg.query("insert into invoices (id,user_id,number,client_name,issue_date,due_date,lines) values ('b','u1','K-2026-001','x','2026-01-01','2026-01-01','[]')"));
  await pg.query("insert into invoices (id,user_id,number,client_name,issue_date,due_date,lines) values ('c','u1','','x','2026-01-01','2026-01-01','[]'), ('d','u1','','x','2026-01-01','2026-01-01','[]')");
  await pg.close();
});

test("Peppol creditnota: 381, CreditNote-root en verwijzing", () => {
  const party = { name: "A", vatNumber: "BE0202239951", peppolId: "0208:0202239951", street: "s", postalCode: "1000", city: "Brussel", countryCode: "BE" };
  const xml = buildPeppolUbl({
    invoice: { number: "C-2026-001", issueDate: "2026-10-29", dueDate: "2026-10-29", notes: "", lines: [line(21)] },
    seller: party, buyer: party, iban: "", paymentReference: "", exempt: false, kind: "credit", creditOf: "K-2026-004",
  });
  assert.match(xml, /<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"/);
  assert.match(xml, /<cbc:CreditNoteTypeCode>381<\/cbc:CreditNoteTypeCode>/);
  assert.match(xml, /<cac:InvoiceDocumentReference><cbc:ID>K-2026-004<\/cbc:ID>/);
  assert.match(xml, /<cac:CreditNoteLine>.*<cbc:CreditedQuantity/s);
  assert.doesNotMatch(xml, /InvoiceTypeCode|<cbc:DueDate>/);
  const ae = buildPeppolUbl({ invoice: { number: "K-1", issueDate: "2026-10-29", dueDate: "", notes: "", lines: [line(21)] }, seller: party, buyer: party, iban: "", paymentReference: "", exempt: false, treatment: "verlegd" });
  assert.match(ae, /<cbc:ID>AE<\/cbc:ID><cbc:Percent>0<\/cbc:Percent><cbc:TaxExemptionReason>Verlegging van heffing/);
  const k = buildPeppolUbl({ invoice: { number: "K-2", issueDate: "2026-10-29", dueDate: "", notes: "", lines: [line(21)] }, seller: party, buyer: { ...party, countryCode: "NL", vatNumber: "NL123456789B01" }, iban: "", paymentReference: "", exempt: false, treatment: "ic_dienst" });
  assert.match(k, /<cbc:ID>K<\/cbc:ID>/);
  assert.match(k, /<cac:Delivery><cbc:ActualDeliveryDate>2026-10-29/);
});
