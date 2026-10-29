/**
 * Facturatieregels (puur, zonder database). Getest in invoicing.test.ts.
 *
 * Bronnen (nagekeken oktober 2026):
 * - KB nr. 1 art. 5 §1: opeenvolgend nummer "volgens één of meer reeksen", btw-nummers, maatstaf per tarief.
 * - KB nr. 1 art. 5 §1 10°quater (sinds 1/1/2025): "Bijzondere vrijstellingsregeling van belasting".
 * - KB nr. 1 art. 20 §3 (sinds 1/1/2023): uitgebreide vermelding bij verlegging van heffing.
 * - W.Btw art. 39bis (vrijgestelde intracommunautaire levering), art. 21 §2 (dienst B2B in andere lidstaat).
 */
import type { InvoiceLine } from "./types";

export type VatTreatment = "standard" | "verlegd" | "ic_levering" | "ic_dienst";
export type InvoiceKind = "invoice" | "credit";
export const VAT_TREATMENTS: VatTreatment[] = ["standard", "verlegd", "ic_levering", "ic_dienst"];
export const VAT_RATES = [0, 6, 12, 21] as const;

export const TREATMENT_LABEL: Record<VatTreatment, string> = {
  standard: "Belgische btw",
  verlegd: "Verlegging van heffing (medecontractant, BE)",
  ic_levering: "Intracommunautaire levering van goederen",
  ic_dienst: "Intracommunautaire dienst (B2B, andere lidstaat)",
};

/** Vermelding op facturen onder de vrijstellingsregeling (KB nr. 1 art. 5 §1 10°quater, sinds 1/1/2025). */
export const EXEMPT_MENTION = "Bijzondere vrijstellingsregeling van belasting";

/** KB nr. 1 art. 20 §3 — verplicht bij werk in onroerende staat met verlegging; ook bruikbaar bij andere verlegging. */
export const REVERSE_CHARGE_MENTION =
  "Verlegging van heffing. Bij gebrek aan schriftelijke betwisting binnen een termijn van één maand na de ontvangst van de factuur, wordt de afnemer geacht te erkennen dat hij een belastingplichtige is gehouden tot de indiening van periodieke aangiften. Als die voorwaarde niet vervuld is, is de afnemer ten aanzien van die voorwaarde aansprakelijk voor de betaling van de verschuldigde belasting, interesten en geldboeten.";
export const IC_GOODS_MENTION = "Vrijgestelde intracommunautaire levering, art. 39bis W.Btw.";
export const IC_SERVICE_MENTION = "Btw verlegd: dienst belastbaar in de lidstaat van de afnemer (art. 21, § 2 W.Btw; art. 196 Richtlijn 2006/112/EG).";

export type VatCategory = { id: "S" | "Z" | "E" | "AE" | "K"; percent: number; reason: string };

/** Peppol/EN 16931-btw-categorie voor één lijn. */
export function lineCategory(rate: number, treatment: VatTreatment, exempt: boolean): VatCategory {
  if (exempt) return { id: "E", percent: 0, reason: EXEMPT_MENTION };
  if (treatment === "verlegd") return { id: "AE", percent: 0, reason: "Verlegging van heffing" };
  if (treatment === "ic_levering") return { id: "K", percent: 0, reason: IC_GOODS_MENTION };
  if (treatment === "ic_dienst") return { id: "K", percent: 0, reason: IC_SERVICE_MENTION };
  return rate > 0 ? { id: "S", percent: rate, reason: "" } : { id: "Z", percent: 0, reason: "" };
}

/** Verplichte tekst op de factuur, of leeg. */
export function legalMention(treatment: VatTreatment, exempt: boolean): string {
  if (exempt) return EXEMPT_MENTION;
  if (treatment === "verlegd") return REVERSE_CHARGE_MENTION;
  if (treatment === "ic_levering") return IC_GOODS_MENTION;
  if (treatment === "ic_dienst") return IC_SERVICE_MENTION;
  return "";
}

/** Btw-tarief dat effectief geldt (0 bij vrijstelling, verlegging of intracommunautair). */
export function effectiveLines(lines: InvoiceLine[], treatment: VatTreatment, exempt: boolean): InvoiceLine[] {
  const zero = exempt || treatment !== "standard";
  return zero ? lines.map((l) => ({ ...l, vatRate: 0 })) : lines;
}

export function asTreatment(v: unknown): VatTreatment {
  return VAT_TREATMENTS.includes(v as VatTreatment) ? (v as VatTreatment) : "standard";
}

/** Belgisch btw-nummer: BE + 10 cijfers (begint met 0 of 1) en mod-97-controle. */
export function isValidBeVat(input: string): boolean {
  const s = String(input ?? "").replace(/[\s.-]/g, "").toUpperCase();
  const m = /^(?:BE)?([01]\d{9})$/.exec(s);
  if (!m) return false;
  const d = m[1];
  return 97 - (Number(d.slice(0, 8)) % 97) === Number(d.slice(8));
}

/** Btw-nummer is Belgisch als het met BE begint of 10 cijfers is. */
export function isBelgianVat(input: string): boolean {
  const s = String(input ?? "").replace(/[\s.-]/g, "").toUpperCase();
  return s.startsWith("BE") || /^[01]\d{9}$/.test(s);
}

/** Buitenlands EU-btw-nummer: landcode + 2..13 tekens (geen VIES-controle). */
export function isForeignVat(input: string): boolean {
  const s = String(input ?? "").replace(/[\s.-]/g, "").toUpperCase();
  return /^(AT|BG|CY|CZ|DE|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|XI)[A-Z0-9]{2,13}$/.test(s);
}

export function normalizeVat(input: string): string {
  const s = String(input ?? "").replace(/[\s.-]/g, "").toUpperCase();
  return /^[01]\d{9}$/.test(s) ? `BE${s}` : s;
}

/** Peppol is verplicht (sinds 1/1/2026) voor facturen aan een Belgische btw-plichtige afnemer. */
export function peppolRequired(clientVat: string, b2c: boolean): boolean {
  return !b2c && isValidBeVat(clientVat);
}

export type InvoiceCheck = {
  clientVat: string;
  b2c: boolean;
  issueDate: string;
  dueDate: string;
  lines: InvoiceLine[];
  treatment: VatTreatment;
  exempt: boolean;
};

/** Validatie vóór bewaren of uitreiken. Leeg = in orde. */
export function invoiceProblems(c: InvoiceCheck, issuing: boolean): string[] {
  const out: string[] = [];
  if (!c.lines.length) out.push("Minstens één lijn met omschrijving en aantal.");
  for (const l of c.lines) {
    if (!(VAT_RATES as readonly number[]).includes(l.vatRate)) out.push(`Btw-tarief ${l.vatRate}% bestaat niet in België (0, 6, 12 of 21).`);
  }
  if (c.dueDate && c.issueDate && c.dueDate < c.issueDate) out.push("De vervaldag ligt vóór de factuurdatum.");
  const vat = String(c.clientVat || "").trim();
  if (vat && isBelgianVat(vat) && !isValidBeVat(vat)) out.push("Het Belgische btw-nummer van de klant klopt niet (formaat of controlegetal).");
  if (vat && !isBelgianVat(vat) && !isForeignVat(vat)) out.push("Het btw-nummer van de klant heeft geen geldig formaat (landcode + nummer).");
  if (issuing && !c.b2c && !vat) out.push("Een factuur aan een onderneming vermeldt het btw-nummer van de klant. Vink 'Particulier' aan als het geen onderneming is.");
  if (!c.exempt && c.treatment === "verlegd" && !isValidBeVat(vat)) out.push("Verlegging van heffing kan alleen naar een klant met een geldig Belgisch btw-nummer.");
  if (!c.exempt && (c.treatment === "ic_levering" || c.treatment === "ic_dienst") && !isForeignVat(vat)) out.push("Intracommunautair vraagt een geldig btw-nummer uit een andere EU-lidstaat.");
  if (c.b2c && c.treatment !== "standard") out.push("Verlegging en intracommunautaire regeling gelden niet voor particulieren.");
  return out;
}

/** Nummerreeks per jaar en soort: K-2026 (facturen), C-2026 (creditnota's). */
export function seriesKey(kind: InvoiceKind, issueDate: string): string {
  return `${kind === "credit" ? "C" : "K"}-${issueDate.slice(0, 4)}`;
}

export function formatNumber(series: string, seq: number): string {
  return `${series}-${String(seq).padStart(3, "0")}`;
}

/** Hoogste volgnummer dat al bestaat in een reeks (bv. oude K-2026-007 -> 7). */
export function maxInSeries(numbers: string[], series: string): number {
  let max = 0;
  const re = new RegExp(`^${series.replace(/[-]/g, "\\-")}-(\\d+)$`);
  for (const n of numbers) {
    const m = re.exec(n);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}
