/**
 * Peppol BIS Billing 3.0 (UBL 2.1) voor Belgische facturen.
 * Puur: geen netwerk, geen database. Getest in peppol.test.ts.
 */
import type { Company, Invoice, InvoiceLine } from "@/lib/types";

export const CUSTOMIZATION_ID = "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0";
export const PROFILE_ID = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";
/** Belgisch schema: KBO-ondernemingsnummer. */
export const BE_SCHEME = "0208";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const amt = (n: number) => r2(n).toFixed(2);
/** Eenheidsprijs mag tot 4 decimalen, zodat aantal × prijs de lijnbedragen blijft geven. */
const price = (n: number) => {
  const s = String(Math.round(n * 10000) / 10000);
  return /\.\d\d/.test(s) ? s : Number(s).toFixed(2);
};

/** Ondernemingsnummer (10 cijfers) uit "BE0123.456.789", "0123456789" of "123456789". Leeg als ongeldig. */
export function enterpriseDigits(input: string): string {
  let d = String(input ?? "").replace(/\D/g, "");
  if (d.length === 9) d = `0${d}`;
  if (d.length !== 10 || !/^[01]/.test(d)) return "";
  const check = 97 - (Number(d.slice(0, 8)) % 97);
  return check === Number(d.slice(8)) ? d : "";
}

/** Peppol-ID volgens de Belgische afspraak: 0208:<ondernemingsnummer>. */
export function peppolIdFromKbo(input: string): string {
  const d = enterpriseDigits(input);
  return d ? `${BE_SCHEME}:${d}` : "";
}

/** "0208:0123456789" -> { scheme, value }, of null als het geen schema:waarde is. */
export function parsePeppolId(id: string): { scheme: string; value: string } | null {
  const m = /^(\d{4}):([A-Za-z0-9.\-_]{1,50})$/.exec(String(id ?? "").trim());
  return m ? { scheme: m[1], value: m[2] } : null;
}

export type PeppolParty = {
  name: string;
  vatNumber: string;
  enterpriseNumber?: string;
  peppolId: string;
  street: string;
  postalCode: string;
  city: string;
  countryCode: string;
};

export type PeppolInput = {
  invoice: Pick<Invoice, "number" | "issueDate" | "dueDate" | "notes" | "lines">;
  seller: PeppolParty;
  buyer: PeppolParty;
  iban: string;
  paymentReference: string;
  exempt: boolean;
};

/** Zaakfiche -> Peppol-partij. Haalt een postcode van 4 cijfers uit de gemeente als die erin staat. */
export function sellerFromCompany(c: Company): PeppolParty {
  const m = /^\s*(\d{4})\s+(.*)$/.exec(c.city || "");
  return {
    name: c.name,
    vatNumber: c.vatNumber,
    enterpriseNumber: c.enterpriseNumber,
    peppolId: peppolIdFromKbo(c.enterpriseNumber || c.vatNumber),
    street: c.address,
    postalCode: m ? m[1] : "",
    city: m ? m[2] : c.city,
    countryCode: "BE",
  };
}

export function countryCode(country: string): string {
  const c = String(country || "").trim().toLowerCase();
  const map: Record<string, string> = { "": "BE", belgië: "BE", belgie: "BE", belgium: "BE", belgique: "BE", nederland: "NL", frankrijk: "FR", duitsland: "DE", luxemburg: "LU" };
  if (map[c]) return map[c];
  return /^[a-z]{2}$/.test(c) ? c.toUpperCase() : "BE";
}

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

type Cat = { id: "S" | "Z" | "E"; percent: number };
function category(line: InvoiceLine, exempt: boolean): Cat {
  if (exempt) return { id: "E", percent: 0 };
  return line.vatRate > 0 ? { id: "S", percent: line.vatRate } : { id: "Z", percent: 0 };
}

export const EXEMPT_REASON = "Bijzondere vrijstellingsregeling kleine ondernemingen (art. 56bis W.Btw)";

/** Bedragen zoals ze in de UBL komen (EN 16931-regels: som van afgeronde lijnen). */
export function peppolTotals(lines: InvoiceLine[], exempt: boolean) {
  const groups = new Map<string, { cat: Cat; base: number }>();
  let net = 0;
  for (const line of lines) {
    const ext = r2(line.qty * line.unitExVat);
    net = r2(net + ext);
    const cat = category(line, exempt);
    const key = `${cat.id}:${cat.percent}`;
    const g = groups.get(key) ?? { cat, base: 0 };
    g.base = r2(g.base + ext);
    groups.set(key, g);
  }
  const subtotals = [...groups.values()].map((g) => ({ ...g, tax: r2((g.base * g.cat.percent) / 100) }));
  const tax = r2(subtotals.reduce((s, g) => s + g.tax, 0));
  return { net, tax, gross: r2(net + tax), subtotals };
}

/** Fouten die verzenden zinloos maken. Leeg = klaar voor Peppol. */
export function peppolProblems(input: PeppolInput): string[] {
  const out: string[] = [];
  if (!input.seller.name) out.push("Je zaaknaam ontbreekt op de zaakfiche.");
  if (!parsePeppolId(input.seller.peppolId)) out.push("Je eigen Peppol-ID ontbreekt: vul een geldig ondernemingsnummer in op de zaakfiche.");
  if (!input.buyer.name) out.push("De klant heeft geen naam.");
  if (!parsePeppolId(input.buyer.peppolId)) out.push("De klant heeft geen geldig Peppol-ID (bv. 0208:0123456789).");
  if (!input.invoice.lines.length) out.push("De factuur heeft geen lijnen.");
  if (!input.seller.city || !input.buyer.city) out.push("Gemeente van verkoper en klant zijn verplicht.");
  return out;
}

function party(tag: "AccountingSupplierParty" | "AccountingCustomerParty", p: PeppolParty): string {
  const id = parsePeppolId(p.peppolId);
  const kbo = enterpriseDigits(p.enterpriseNumber || p.vatNumber);
  const vat = String(p.vatNumber || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return [
    `<cac:${tag}><cac:Party>`,
    id ? `<cbc:EndpointID schemeID="${esc(id.scheme)}">${esc(id.value)}</cbc:EndpointID>` : "",
    `<cac:PartyName><cbc:Name>${esc(p.name)}</cbc:Name></cac:PartyName>`,
    `<cac:PostalAddress>`,
    p.street ? `<cbc:StreetName>${esc(p.street)}</cbc:StreetName>` : "",
    p.city ? `<cbc:CityName>${esc(p.city)}</cbc:CityName>` : "",
    p.postalCode ? `<cbc:PostalZone>${esc(p.postalCode)}</cbc:PostalZone>` : "",
    `<cac:Country><cbc:IdentificationCode>${esc(p.countryCode || "BE")}</cbc:IdentificationCode></cac:Country>`,
    `</cac:PostalAddress>`,
    vat ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(vat)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : "",
    `<cac:PartyLegalEntity><cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName>`,
    kbo ? `<cbc:CompanyID schemeID="0208">${kbo}</cbc:CompanyID>` : "",
    `</cac:PartyLegalEntity>`,
    `</cac:Party></cac:${tag}>`,
  ].join("");
}

function taxCategory(tag: "TaxCategory" | "ClassifiedTaxCategory", cat: Cat): string {
  return [
    `<cac:${tag}><cbc:ID>${cat.id}</cbc:ID><cbc:Percent>${cat.percent}</cbc:Percent>`,
    tag === "TaxCategory" && cat.id === "E" ? `<cbc:TaxExemptionReason>${esc(EXEMPT_REASON)}</cbc:TaxExemptionReason>` : "",
    `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:${tag}>`,
  ].join("");
}

/** Bouwt een Peppol BIS Billing 3.0 UBL-factuur (type 380, EUR). */
export function buildPeppolUbl(input: PeppolInput): string {
  const { invoice, seller, buyer, exempt } = input;
  const t = peppolTotals(invoice.lines, exempt);
  const iban = String(input.iban || "").replace(/\s+/g, "").toUpperCase();
  const lines = invoice.lines.map((line, i) => {
    const cat = category(line, exempt);
    return [
      `<cac:InvoiceLine><cbc:ID>${i + 1}</cbc:ID>`,
      `<cbc:InvoicedQuantity unitCode="C62">${line.qty}</cbc:InvoicedQuantity>`,
      `<cbc:LineExtensionAmount currencyID="EUR">${amt(line.qty * line.unitExVat)}</cbc:LineExtensionAmount>`,
      `<cac:Item><cbc:Name>${esc(line.description.slice(0, 200))}</cbc:Name>${taxCategory("ClassifiedTaxCategory", cat)}</cac:Item>`,
      `<cac:Price><cbc:PriceAmount currencyID="EUR">${price(line.unitExVat)}</cbc:PriceAmount></cac:Price>`,
      `</cac:InvoiceLine>`,
    ].join("");
  });
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`,
    `<cbc:CustomizationID>${CUSTOMIZATION_ID}</cbc:CustomizationID>`,
    `<cbc:ProfileID>${PROFILE_ID}</cbc:ProfileID>`,
    `<cbc:ID>${esc(invoice.number)}</cbc:ID>`,
    `<cbc:IssueDate>${esc(invoice.issueDate)}</cbc:IssueDate>`,
    invoice.dueDate ? `<cbc:DueDate>${esc(invoice.dueDate)}</cbc:DueDate>` : "",
    `<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>`,
    invoice.notes ? `<cbc:Note>${esc(invoice.notes)}</cbc:Note>` : "",
    `<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>`,
    `<cbc:BuyerReference>${esc(invoice.number)}</cbc:BuyerReference>`,
    party("AccountingSupplierParty", seller),
    party("AccountingCustomerParty", buyer),
    iban
      ? `<cac:PaymentMeans><cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>${input.paymentReference ? `<cbc:PaymentID>${esc(input.paymentReference)}</cbc:PaymentID>` : ""}<cac:PayeeFinancialAccount><cbc:ID>${esc(iban)}</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>`
      : "",
    `<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${amt(t.tax)}</cbc:TaxAmount>`,
    ...t.subtotals.map(
      (g) =>
        `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">${amt(g.base)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">${amt(g.tax)}</cbc:TaxAmount>${taxCategory("TaxCategory", g.cat)}</cac:TaxSubtotal>`,
    ),
    `</cac:TaxTotal>`,
    `<cac:LegalMonetaryTotal>`,
    `<cbc:LineExtensionAmount currencyID="EUR">${amt(t.net)}</cbc:LineExtensionAmount>`,
    `<cbc:TaxExclusiveAmount currencyID="EUR">${amt(t.net)}</cbc:TaxExclusiveAmount>`,
    `<cbc:TaxInclusiveAmount currencyID="EUR">${amt(t.gross)}</cbc:TaxInclusiveAmount>`,
    `<cbc:PayableAmount currencyID="EUR">${amt(t.gross)}</cbc:PayableAmount>`,
    `</cac:LegalMonetaryTotal>`,
    ...lines,
    `</Invoice>`,
  ].join("\n");
}
