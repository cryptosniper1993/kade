import { test } from "node:test";
import assert from "node:assert/strict";
import { clientListing, clientListingXml, exemptTurnover, icListing, icListingXml, intervatVatXml, vatGrids, type Sale } from "./vatreturn.ts";

const L = (unit: number, vatRate: number) => ({ description: "x", qty: 1, unitExVat: unit, vatRate });
const sales: Sale[] = [
  { kind: "invoice", treatment: "standard", issueDate: "2026-01-10", clientName: "A", clientVat: "BE0202239951", lines: [L(1000, 21), L(100, 6), L(50, 12), L(10, 0)] },
  { kind: "invoice", treatment: "verlegd", issueDate: "2026-02-10", clientName: "B", clientVat: "BE0202239951", lines: [L(500, 21)] },
  { kind: "invoice", treatment: "ic_dienst", issueDate: "2026-03-10", clientName: "NL", clientVat: "NL123456789B01", lines: [L(300, 21)] },
  { kind: "invoice", treatment: "ic_levering", issueDate: "2026-03-11", clientName: "DE", clientVat: "DE123456789", lines: [L(200, 21)] },
  { kind: "credit", treatment: "standard", issueDate: "2026-03-20", clientName: "A", clientVat: "BE0202239951", lines: [L(100, 21)] },
  { kind: "invoice", treatment: "standard", issueDate: "2026-04-01", clientName: "Q2", clientVat: "BE0202239951", lines: [L(999, 21)] },
  { kind: "invoice", treatment: "standard", issueDate: "2026-02-01", clientName: "Klein", clientVat: "BE0308357159", lines: [L(200, 21)] },
];

test("roosters Q1", () => {
  const g = vatGrids(sales, [{ kind: "invoice", issueDate: "2026-02-02", totalExVat: 400, totalVat: 84 }, { kind: "creditnote", issueDate: "2026-02-03", totalExVat: -50, totalVat: -10.5 }], { year: 2026, quarter: 1 });
  assert.equal(g["03"], 1200);
  assert.equal(g["01"], 100);
  assert.equal(g["02"], 50);
  assert.equal(g["00"], 10);
  assert.equal(g["45"], 500);
  assert.equal(g["44"], 300);
  assert.equal(g["46"], 200);
  assert.equal(g["49"], 100);
  assert.equal(g["54"], 252 + 6 + 6);
  assert.equal(g["64"], 21);
  assert.equal(g["82"], 400);
  assert.equal(g["59"], 84);
  assert.equal(g["85"], 50);
  assert.equal(g["63"], 10.5);
  assert.equal(g["71"], 264 + 10.5 - 84 - 21);
  assert.equal(g["72"], 0);
  const xml = intervatVatXml({ vatNumber: "BE0308357159", name: "K", street: "", postCode: "", city: "", email: "" }, { year: 2026, quarter: 1 }, g);
  assert.match(xml, /<ns2:Amount GridNumber="3">1200.00<\/ns2:Amount>/);
  assert.match(xml, /<ns2:Quarter>1<\/ns2:Quarter><ns2:Year>2026/);
  assert.match(xml, /<VATNumber>0308357159<\/VATNumber>/);
});

test("vrijstellingsregeling: alles 0% in de roosters, omzetopgave telt", () => {
  const g = vatGrids(sales, [], { year: 2026, quarter: 1 }, true);
  assert.equal(g["54"], 0);
  assert.equal(exemptTurnover(sales, 2026), 1160 + 500 + 300 + 200 - 100 + 999 + 200);
});

test("klantenlisting vanaf 250 euro, creditnota's afgetrokken", () => {
  const rows = clientListing(sales, 2026);
  assert.deepEqual(rows.map((r) => r.vatNumber), ["BE0202239951"]);
  assert.equal(rows[0].turnover, 1160 + 500 - 100 + 999);
  assert.match(clientListingXml({ vatNumber: "BE0308357159", name: "K", street: "", postCode: "", city: "", email: "" }, 2026, rows), /ClientsNbr="1"/);
});

test("IC-opgave: L en S", () => {
  const rows = icListing(sales, { year: 2026, quarter: 1 });
  assert.deepEqual(rows.map((r) => `${r.country}${r.vatNumber}:${r.code}:${r.amount}`).sort(), ["DE123456789:L:200", "NL123456789B01:S:300"]);
  assert.match(icListingXml({ vatNumber: "BE0308357159", name: "K", street: "", postCode: "", city: "", email: "" }, { year: 2026, quarter: 1 }, rows), /<ns2:Code>S<\/ns2:Code>/);
});
