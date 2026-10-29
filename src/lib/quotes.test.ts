import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canMove, conversionBlocker, invoiceDraftFromQuote, nextQuoteNumber, quoteTotals, type Quote } from "./quotes.ts";

const base: Quote = {
  id: "q1", number: "OF-2026-004", clientId: "c1", clientName: "Acme", clientVat: "BE0123456789",
  clientAddress: "Kaai 1, 2000 Antwerpen", issueDate: "2026-10-01", validUntil: "2026-10-31",
  status: "goedgekeurd", notes: "Fase 1", projectId: "p1", invoiceId: null,
  lines: [
    { description: "Analyse", qty: 2, unitExVat: 450, vatRate: 21 },
    { description: "Boek", qty: 3, unitExVat: 19.99, vatRate: 6 },
  ],
};

describe("offertes", () => {
  it("nummert OF-YYYY-NNN per jaar", () => {
    assert.equal(nextQuoteNumber("2026", []), "OF-2026-001");
    assert.equal(nextQuoteNumber("2026", ["OF-2026-001", "OF-2026-009", "OF-2025-044"]), "OF-2026-010");
  });
  it("berekent totalen zoals facturen", () => {
    const t = quoteTotals(base.lines);
    assert.deepEqual(t, { ex: 959.97, vat: 192.6, incl: 1152.57 });
    assert.deepEqual(quoteTotals(base.lines, true), { ex: 959.97, vat: 0, incl: 959.97 });
  });
  it("zet een goedgekeurde offerte om met klant en lijnen", () => {
    const inv = invoiceDraftFromQuote(base, "2026-10-29", 14);
    assert.equal(inv.clientName, "Acme");
    assert.equal(inv.clientId, "c1");
    assert.equal(inv.dueDate, "2026-11-12");
    assert.deepEqual(inv.lines, base.lines);
    assert.notEqual(inv.lines[0], base.lines[0]);
    assert.match(inv.notes, /OF-2026-004/);
    assert.deepEqual(quoteTotals(inv.lines), quoteTotals(base.lines));
  });
  it("weigert dubbele of voortijdige omzetting", () => {
    assert.throws(() => invoiceDraftFromQuote({ ...base, invoiceId: "i1" }, "2026-10-29"), /al omgezet/);
    assert.throws(() => invoiceDraftFromQuote({ ...base, status: "gefactureerd" }, "2026-10-29"), /al omgezet/);
    assert.throws(() => invoiceDraftFromQuote({ ...base, status: "verstuurd" }, "2026-10-29"), /goedgekeurde/);
    assert.equal(conversionBlocker(base), null);
  });
  it("laat gefactureerd niet meer wijzigen", () => {
    assert.equal(canMove("gefactureerd", "concept"), false);
    assert.equal(canMove("verstuurd", "goedgekeurd"), true);
  });
});
