/**
 * Voorbereiding btw-aangifte, klantenlisting, intracommunautaire opgave en omzetopgave
 * (vrijstellingsregeling). Puur, getest in vatreturn.test.ts.
 *
 * Roosters (formulier 625): 00/01/02/03 omzet aan 0/6/12/21%, 44 IC-diensten, 45 verlegging (medecontractant),
 * 46 IC-leveringen, 47 andere vrijgestelde, 49 uitgereikte creditnota's, 54 verschuldigde btw op 01-03,
 * 55/56 btw op IC-verwervingen/verlegging bij aankoop, 59 aftrekbare btw, 63/64 btw op ontvangen/uitgereikte
 * creditnota's, 71 te betalen, 72 terug te krijgen. 81/82/83 aankopen, 85 ontvangen creditnota's.
 *
 * LET OP: 55/56/57/86/87/88 (aankopen met verlegging, IC-verwervingen) worden NIET automatisch berekend,
 * en het XML-formaat is niet tegen de officiële Intervat-XSD gevalideerd. Controleer vóór upload.
 */
import type { InvoiceLine } from "./types";
import { effectiveLines, isValidBeVat, normalizeVat, type VatTreatment } from "./invoicing.ts";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type Sale = {
  kind: "invoice" | "credit";
  treatment: VatTreatment;
  issueDate: string;
  clientName: string;
  clientVat: string;
  lines: InvoiceLine[];
};

export type Purchase = {
  kind: "invoice" | "creditnote";
  issueDate: string;
  totalExVat: number;
  totalVat: number;
};

export type Period = { year: number; quarter?: number; month?: number };

export function inPeriod(date: string, p: Period): boolean {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  if (y !== p.year) return false;
  if (p.month) return m === p.month;
  if (p.quarter) return Math.ceil(m / 3) === p.quarter;
  return true;
}

export type Grids = Record<string, number>;
export const GRIDS = ["00", "01", "02", "03", "44", "45", "46", "47", "49", "54", "55", "56", "59", "63", "64", "71", "72", "81", "82", "83", "85"];

export function vatGrids(sales: Sale[], purchases: Purchase[], p: Period, exempt = false): Grids {
  const g: Grids = Object.fromEntries(GRIDS.map((k) => [k, 0]));
  const add = (k: string, v: number) => (g[k] = r2(g[k] + v));
  for (const s of sales) {
    if (!inPeriod(s.issueDate, p)) continue;
    for (const line of effectiveLines(s.lines, s.treatment, exempt)) {
      const base = r2(line.qty * line.unitExVat);
      const vat = r2((base * line.vatRate) / 100);
      if (s.kind === "credit") {
        add("49", base);
        add("64", vat);
        continue;
      }
      if (s.treatment === "ic_dienst") add("44", base);
      else if (s.treatment === "verlegd") add("45", base);
      else if (s.treatment === "ic_levering") add("46", base);
      else if (line.vatRate === 6) add("01", base);
      else if (line.vatRate === 12) add("02", base);
      else if (line.vatRate === 21) add("03", base);
      else add("00", base);
      add("54", vat);
    }
  }
  for (const pu of purchases) {
    if (!inPeriod(pu.issueDate, p)) continue;
    if (pu.kind === "creditnote") {
      add("85", Math.abs(pu.totalExVat));
      add("63", Math.abs(pu.totalVat));
    } else {
      // Zonder opsplitsing per soort komt alles in 82 (diensten en diverse goederen). Herklasseer 81/83 zelf.
      add("82", pu.totalExVat);
      add("59", pu.totalVat);
    }
  }
  const due = r2(g["54"] + g["55"] + g["56"] + g["63"]);
  const back = r2(g["59"] + g["64"]);
  g["71"] = due > back ? r2(due - back) : 0;
  g["72"] = back > due ? r2(back - due) : 0;
  return g;
}

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type Declarant = { vatNumber: string; name: string; street: string; postCode: string; city: string; email: string };

const digits = (vat: string) => normalizeVat(vat).replace(/^BE/, "");

function declarantXml(ns: string, d: Declarant): string {
  return `<${ns}:Declarant><VATNumber>${esc(digits(d.vatNumber))}</VATNumber><Name>${esc(d.name)}</Name><Street>${esc(d.street)}</Street><PostCode>${esc(d.postCode)}</PostCode><City>${esc(d.city)}</City><CountryCode>BE</CountryCode><EmailAddress>${esc(d.email)}</EmailAddress><Phone></Phone></${ns}:Declarant>`;
}

/** Periodieke btw-aangifte in het Intervat-XML-formaat (VATConsignment). Lege roosters worden weggelaten. */
export function intervatVatXml(d: Declarant, p: Period, g: Grids): string {
  const period = p.month ? `<ns2:Month>${p.month}</ns2:Month>` : `<ns2:Quarter>${p.quarter ?? 1}</ns2:Quarter>`;
  const amounts = GRIDS.filter((k) => g[k]).map((k) => `<ns2:Amount GridNumber="${Number(k)}">${g[k].toFixed(2)}</ns2:Amount>`);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<ns2:VATConsignment xmlns="http://www.minfin.fgov.be/InputCommon" xmlns:ns2="http://www.minfin.fgov.be/VATConsignment" VATDeclarationsNbr="1">`,
    `<ns2:VATDeclaration SequenceNumber="1">`,
    declarantXml("ns2", d),
    `<ns2:Period>${period}<ns2:Year>${p.year}</ns2:Year></ns2:Period>`,
    `<ns2:Data>${amounts.join("")}</ns2:Data>`,
    `<ns2:ClientListingNihil>NO</ns2:ClientListingNihil>`,
    `<ns2:Ask Restitution="NO" Payment="NO"/>`,
    `</ns2:VATDeclaration>`,
    `</ns2:VATConsignment>`,
  ].join("\n");
}

export type ListingRow = { vatNumber: string; name: string; turnover: number; vat: number };

/**
 * Jaarlijkse klantenlisting: Belgische btw-plichtige afnemers met minstens 250 euro omzet (excl. btw)
 * in het kalenderjaar, creditnota's afgetrokken. Indienen vóór 31 maart.
 */
export function clientListing(sales: Sale[], year: number, exempt = false): ListingRow[] {
  const map = new Map<string, ListingRow>();
  for (const s of sales) {
    if (!inPeriod(s.issueDate, { year }) || !isValidBeVat(s.clientVat)) continue;
    const key = normalizeVat(s.clientVat);
    const row = map.get(key) ?? { vatNumber: key, name: s.clientName, turnover: 0, vat: 0 };
    const sign = s.kind === "credit" ? -1 : 1;
    for (const line of effectiveLines(s.lines, s.treatment, exempt)) {
      const base = r2(line.qty * line.unitExVat);
      row.turnover = r2(row.turnover + sign * base);
      row.vat = r2(row.vat + sign * r2((base * line.vatRate) / 100));
    }
    map.set(key, row);
  }
  return [...map.values()].filter((r) => r.turnover >= 250).sort((a, b) => a.vatNumber.localeCompare(b.vatNumber));
}

export function clientListingXml(d: Declarant, year: number, rows: ListingRow[]): string {
  const total = r2(rows.reduce((s, r) => s + r.turnover, 0));
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<ns2:ClientListingConsignment xmlns="http://www.minfin.fgov.be/InputCommon" xmlns:ns2="http://www.minfin.fgov.be/ClientListingConsignment" ClientListingsNbr="1">`,
    `<ns2:ClientListing SequenceNumber="1" ClientsNbr="${rows.length}" TurnOverSum="${total.toFixed(2)}" VATAmountSum="${r2(rows.reduce((s, r) => s + r.vat, 0)).toFixed(2)}">`,
    declarantXml("ns2", d),
    `<ns2:Period>${year}</ns2:Period>`,
    ...rows.map(
      (r, i) =>
        `<ns2:Client SequenceNumber="${i + 1}"><ns2:CompanyVATNumber issuedBy="BE">${esc(digits(r.vatNumber))}</ns2:CompanyVATNumber><ns2:TurnOver>${r.turnover.toFixed(2)}</ns2:TurnOver><ns2:VATAmount>${r.vat.toFixed(2)}</ns2:VATAmount></ns2:Client>`,
    ),
    `</ns2:ClientListing>`,
    `</ns2:ClientListingConsignment>`,
  ].join("\n");
}

export type IcRow = { vatNumber: string; country: string; code: "L" | "S"; amount: number };

/** Intracommunautaire opgave: L = leveringen (rooster 46), S = diensten (rooster 44), per afnemer. */
export function icListing(sales: Sale[], p: Period): IcRow[] {
  const map = new Map<string, IcRow>();
  for (const s of sales) {
    if (!inPeriod(s.issueDate, p)) continue;
    if (s.treatment !== "ic_levering" && s.treatment !== "ic_dienst") continue;
    const vat = normalizeVat(s.clientVat);
    const code = s.treatment === "ic_levering" ? "L" : "S";
    const key = `${vat}:${code}`;
    const row = map.get(key) ?? { vatNumber: vat.slice(2), country: vat.slice(0, 2), code, amount: 0 };
    const sign = s.kind === "credit" ? -1 : 1;
    for (const l of s.lines) row.amount = r2(row.amount + sign * r2(l.qty * l.unitExVat));
    map.set(key, row);
  }
  return [...map.values()].filter((r) => r.amount !== 0);
}

export function icListingXml(d: Declarant, p: Period, rows: IcRow[]): string {
  const period = p.month ? `<ns2:Month>${p.month}</ns2:Month>` : `<ns2:Quarter>${p.quarter ?? 1}</ns2:Quarter>`;
  const total = r2(rows.reduce((s, r) => s + r.amount, 0));
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<ns2:IntraConsignment xmlns="http://www.minfin.fgov.be/InputCommon" xmlns:ns2="http://www.minfin.fgov.be/IntraConsignment" IntraListingsNbr="1">`,
    `<ns2:IntraListing SequenceNumber="1" ClientsNbr="${rows.length}" AmountSum="${total.toFixed(2)}">`,
    declarantXml("ns2", d),
    `<ns2:Period>${period}<ns2:Year>${p.year}</ns2:Year></ns2:Period>`,
    ...rows.map(
      (r, i) =>
        `<ns2:IntraClient SequenceNumber="${i + 1}"><ns2:CompanyVATNumber issuedBy="${esc(r.country)}">${esc(r.vatNumber)}</ns2:CompanyVATNumber><ns2:Code>${r.code}</ns2:Code><ns2:Amount>${r.amount.toFixed(2)}</ns2:Amount></ns2:IntraClient>`,
    ),
    `</ns2:IntraListing>`,
    `</ns2:IntraConsignment>`,
  ].join("\n");
}

/** Omzetopgave voor de vrijstellingsregeling (vóór 31 maart, via Intervat > klantenlisting): totale Belgische omzet. */
export function exemptTurnover(sales: Sale[], year: number): number {
  let t = 0;
  for (const s of sales) {
    if (!inPeriod(s.issueDate, { year })) continue;
    const sign = s.kind === "credit" ? -1 : 1;
    for (const l of s.lines) t = r2(t + sign * r2(l.qty * l.unitExVat));
  }
  return t;
}
