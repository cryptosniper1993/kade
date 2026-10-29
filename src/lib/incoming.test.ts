import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canMoveIncoming, dedupeKey, incomingJournalLines, parseIncomingUbl } from "./incoming.ts";
import { buildPeppolUbl } from "./peppol.ts";

const party = (name: string, kbo: string) => ({
  name, vatNumber: `BE${kbo}`, enterpriseNumber: kbo, peppolId: `0208:${kbo}`,
  street: "Kaai 1", postalCode: "2000", city: "Antwerpen", countryCode: "BE",
});

const ours = buildPeppolUbl({
  invoice: {
    number: "LEV-77", issueDate: "2026-10-01", dueDate: "2026-10-31", notes: "Hosting & support",
    lines: [
      { description: "Hosting <pro>", qty: 2, unitExVat: 50, vatRate: 21 },
      { description: "Boek", qty: 1, unitExVat: 20, vatRate: 6 },
    ],
  },
  seller: party("Leverancier & Co", "0123456749"),
  buyer: party("Mijn Zaak", "0987654321"),
  iban: "BE68 5390 0754 7034", paymentReference: "+++123/4567/89012+++", exempt: false,
});

const foreign = `<?xml version="1.0" encoding="UTF-8"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>
  <cbc:ID>CN-5</cbc:ID>
  <cbc:IssueDate>2026-10-05</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AdditionalDocumentReference><cbc:ID>CN-5</cbc:ID>
    <cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="application/pdf" filename="cn-5.pdf">JVBERi0x
LjQK</cbc:EmbeddedDocumentBinaryObject></cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty><cac:Party><cbc:EndpointID schemeID="9925">BE0123456749</cbc:EndpointID>
    <cac:PartyLegalEntity><cbc:RegistrationName>Telco NV</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyName><cbc:Name>Mijn Zaak</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">2.10</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">10.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">2.10</cbc:TaxAmount>
    <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>21</cbc:Percent></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount currencyID="EUR">10.00</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">12.10</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">12.10</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:CreditNoteLine><cbc:ID>1</cbc:ID><cbc:CreditedQuantity unitCode="C62">1</cbc:CreditedQuantity><cbc:LineExtensionAmount currencyID="EUR">10.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Korting</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>21</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">10</cbc:PriceAmount></cac:Price></cac:CreditNoteLine>
</CreditNote>`;

describe("inkomende UBL", () => {
  it("leest een BIS Billing 3.0 factuur", () => {
    const p = parseIncomingUbl(ours);
    assert.equal(p.kind, "invoice");
    assert.equal(p.number, "LEV-77");
    assert.equal(p.issueDate, "2026-10-01");
    assert.equal(p.dueDate, "2026-10-31");
    assert.equal(p.supplierName, "Leverancier & Co");
    assert.equal(p.supplierVat, "BE0123456749");
    assert.equal(p.supplierPeppolId, "0208:0123456749");
    assert.equal(p.buyerName, "Mijn Zaak");
    assert.equal(p.supplierIban, "BE68539007547034");
    assert.equal(p.notes, "Hosting & support");
    assert.equal(p.lines.length, 2);
    assert.deepEqual(p.lines[0], { description: "Hosting <pro>", qty: 2, unitExVat: 50, netAmount: 100, vatRate: 21, vatCategory: "S" });
    assert.equal(p.vat.length, 2);
    assert.equal(p.totalExVat, 120);
    assert.equal(p.totalVat, 22.2);
    assert.equal(p.totalInclVat, 142.2);
    assert.equal(p.payable, 142.2);
    assert.equal(p.pdf, null);
  });

  it("leest een creditnota met ingebedde PDF", () => {
    const p = parseIncomingUbl(foreign);
    assert.equal(p.kind, "creditnote");
    assert.equal(p.number, "CN-5");
    assert.equal(p.supplierName, "Telco NV");
    assert.equal(p.supplierPeppolId, "9925:BE0123456749");
    assert.equal(p.lines[0].description, "Korting");
    assert.equal(p.totalVat, 2.1);
    assert.equal(p.payable, 12.1);
    assert.deepEqual(p.pdf, { filename: "cn-5.pdf", mime: "application/pdf", base64: "JVBERi0xLjQK" });
  });

  it("weigert geen-UBL", () => {
    assert.throws(() => parseIncomingUbl("<Order/>"), /geen UBL/);
    assert.throws(() => parseIncomingUbl("<Invoice><cbc:IssueDate>2026-01-01</cbc:IssueDate></Invoice>"), /nummer/);
  });

  it("dedupe per leverancier en nummer", () => {
    const a = parseIncomingUbl(ours);
    assert.equal(dedupeKey(a), "BE0123456749|LEV-77");
    assert.equal(dedupeKey({ ...a, number: " lev-77 " }), dedupeKey(a));
    assert.notEqual(dedupeKey({ ...a, supplierVat: "BE0999999999" }), dedupeKey(a));
  });

  it("statussen en boeking", () => {
    assert.equal(canMoveIncoming("nieuw", "goedgekeurd"), true);
    assert.equal(canMoveIncoming("betaald", "nieuw"), false);
    assert.equal(canMoveIncoming("betwist", "betaald"), false);
    const l = incomingJournalLines({ kind: "invoice", totalExVat: 120, totalVat: 22.2, payable: 142.2 }, "6110", false);
    assert.deepEqual(l, [
      { account: "6110", debit: 120, credit: 0 },
      { account: "4110", debit: 22.2, credit: 0 },
      { account: "4400", debit: 0, credit: 142.2 },
    ]);
    const e = incomingJournalLines({ kind: "creditnote", totalExVat: 10, totalVat: 2.1, payable: 12.1 }, "6130", true);
    assert.deepEqual(e, [{ account: "6130", debit: 0, credit: 12.1 }, { account: "4400", debit: 12.1, credit: 0 }]);
  });
});
