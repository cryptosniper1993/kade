import { round2 } from "./money.ts";
import type { InvoiceLine } from "./types";

export type QuoteStatus = "concept" | "verstuurd" | "goedgekeurd" | "afgewezen" | "gefactureerd";
export const QUOTE_STATUSES: QuoteStatus[] = ["concept", "verstuurd", "goedgekeurd", "afgewezen", "gefactureerd"];

export type Quote = {
  id: string;
  number: string;
  clientId: string | null;
  clientName: string;
  clientVat: string;
  clientAddress: string;
  issueDate: string;
  validUntil: string;
  status: QuoteStatus;
  notes: string;
  lines: InvoiceLine[];
  projectId: string | null;
  invoiceId: string | null;
};

/** Volgend offertenummer OF-YYYY-NNN, per jaar doorlopend. */
export function nextQuoteNumber(year: string, existing: string[]): string {
  const prefix = `OF-${year}-`;
  let max = 0;
  for (const n of existing) {
    if (!n.startsWith(prefix)) continue;
    const seq = Number(n.slice(prefix.length));
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export type Totals = { ex: number; vat: number; incl: number };

/** Zelfde berekening als invoiceTotals (finance.ts): btw per lijn afgerond, zodat offerte en factuur exact overeenkomen. */
export function quoteTotals(lines: InvoiceLine[], exempt = false): Totals {
  let ex = 0;
  let vat = 0;
  for (const line of lines) {
    const base = round2(line.qty * line.unitExVat);
    ex += base;
    vat += round2((base * (exempt ? 0 : line.vatRate)) / 100);
  }
  ex = round2(ex);
  vat = round2(vat);
  return { ex, vat, incl: round2(ex + vat) };
}

/** Welke statusovergangen mag de gebruiker zelf maken. */
export function canMove(from: QuoteStatus, to: QuoteStatus): boolean {
  const allowed: Record<QuoteStatus, QuoteStatus[]> = {
    concept: ["verstuurd", "goedgekeurd", "afgewezen"],
    verstuurd: ["goedgekeurd", "afgewezen", "concept"],
    goedgekeurd: ["afgewezen", "verstuurd"],
    afgewezen: ["concept", "verstuurd"],
    gefactureerd: [],
  };
  return allowed[from].includes(to);
}

export function conversionBlocker(quote: Pick<Quote, "status" | "invoiceId">): string | null {
  if (quote.invoiceId || quote.status === "gefactureerd") return "Deze offerte is al omgezet naar een factuur.";
  if (quote.status !== "goedgekeurd") return "Enkel een goedgekeurde offerte zet je om naar een factuur.";
  return null;
}

function shift(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Conceptfactuur op basis van een goedgekeurde offerte: klant en lijnen gekopieerd. */
export function invoiceDraftFromQuote(quote: Quote, today: string, payDays = 30) {
  const blocker = conversionBlocker(quote);
  if (blocker) throw new Error(blocker);
  const ref = `Volgens offerte ${quote.number}.`;
  return {
    clientId: quote.clientId,
    clientName: quote.clientName,
    clientVat: quote.clientVat,
    clientAddress: quote.clientAddress,
    issueDate: today,
    dueDate: shift(today, payDays > 0 ? payDays : 30),
    notes: quote.notes ? `${ref} ${quote.notes}` : ref,
    lines: quote.lines.map((l) => ({ description: l.description, qty: l.qty, unitExVat: l.unitExVat, vatRate: l.vatRate })),
  };
}
