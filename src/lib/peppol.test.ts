import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPeppolUbl, enterpriseDigits, peppolIdFromKbo, peppolProblems, peppolTotals, parsePeppolId, sellerFromCompany } from "./peppol.ts";

const seller = { name: "Kade & Co", vatNumber: "BE0308.357.159", peppolId: "0208:0308357159", street: "Kaai 1", postalCode: "2000", city: "Antwerpen", countryCode: "BE" };
const buyer = { name: "Klant <BV>", vatNumber: "BE0202239951", peppolId: "0208:0202239951", street: "Straat 2", postalCode: "1000", city: "Brussel", countryCode: "BE" };
const invoice = {
  number: "K-2026-001", issueDate: "2026-10-29", dueDate: "2026-11-28", notes: "",
  lines: [
    { description: "Advies", qty: 3, unitExVat: 100.005, vatRate: 21 },
    { description: "Boek", qty: 1, unitExVat: 20, vatRate: 6 },
  ],
};

test("ondernemingsnummer en Peppol-ID", () => {
  assert.equal(enterpriseDigits("BE0308.357.159"), "0308357159");
  assert.equal(enterpriseDigits("308357159"), "0308357159");
  assert.equal(enterpriseDigits("0308357158"), "");
  assert.equal(peppolIdFromKbo("BE 0202.239.951"), "0208:0202239951");
  assert.deepEqual(parsePeppolId("0208:0202239951"), { scheme: "0208", value: "0202239951" });
  assert.equal(parsePeppolId("BE0202239951"), null);
});

test("zaakfiche haalt postcode uit gemeente", () => {
  const s = sellerFromCompany({ name: "X", legalForm: "eenmanszaak", vatNumber: "BE0308357159", enterpriseNumber: "", address: "Kaai 1", city: "2000 Antwerpen", email: "", iban: "", vatRegime: "quarterly", activityStatus: "bijberoep", yearEndMonth: 12 });
  assert.equal(s.postalCode, "2000");
  assert.equal(s.city, "Antwerpen");
  assert.equal(s.peppolId, "0208:0308357159");
});

test("totalen volgen EN 16931", () => {
  const t = peppolTotals(invoice.lines, false);
  assert.equal(t.net, 320.02);
  assert.equal(t.tax, 64.2);
  assert.equal(t.gross, 384.22);
  assert.equal(t.subtotals.length, 2);
});

test("UBL bevat de verplichte Peppol BIS 3.0 velden", () => {
  const xml = buildPeppolUbl({ invoice, seller, buyer, iban: "BE68 5390 0754 7034", paymentReference: "+++000/0000/00101+++", exempt: false });
  assert.match(xml, /<cbc:CustomizationID>urn:cen\.eu:en16931:2017#compliant#urn:fdc:peppol\.eu:2017:poacc:billing:3\.0<\/cbc:CustomizationID>/);
  assert.match(xml, /<cbc:ProfileID>urn:fdc:peppol\.eu:2017:poacc:billing:01:1\.0<\/cbc:ProfileID>/);
  assert.match(xml, /<cbc:InvoiceTypeCode>380<\/cbc:InvoiceTypeCode>/);
  assert.match(xml, /<cbc:EndpointID schemeID="0208">0308357159<\/cbc:EndpointID>/);
  assert.match(xml, /<cbc:EndpointID schemeID="0208">0202239951<\/cbc:EndpointID>/);
  assert.match(xml, /Klant &lt;BV&gt;/);
  assert.match(xml, /Kade &amp; Co/);
  assert.match(xml, /<cbc:ID>BE68539007547034<\/cbc:ID>/);
  assert.match(xml, /<cbc:PayableAmount currencyID="EUR">384\.22<\/cbc:PayableAmount>/);
  assert.match(xml, /<cbc:PriceAmount currencyID="EUR">100\.005<\/cbc:PriceAmount>/);
  assert.equal((xml.match(/<cac:InvoiceLine>/g) ?? []).length, 2);
  assert.ok(xml.indexOf("<cac:LegalMonetaryTotal>") < xml.indexOf("<cac:InvoiceLine>"));
});

test("vrijgestelde kleine onderneming krijgt categorie E met reden", () => {
  const xml = buildPeppolUbl({ invoice, seller, buyer, iban: "", paymentReference: "", exempt: true });
  assert.match(xml, /<cbc:ID>E<\/cbc:ID><cbc:Percent>0<\/cbc:Percent><cbc:TaxExemptionReason>/);
  assert.match(xml, /<cbc:TaxAmount currencyID="EUR">0\.00<\/cbc:TaxAmount>/);
});

test("problemen worden gemeld", () => {
  const p = peppolProblems({ invoice, seller, buyer: { ...buyer, peppolId: "" }, iban: "", paymentReference: "", exempt: false });
  assert.equal(p.length, 1);
});
