import { accountKind, accountName } from "./accounts";
import { round2 } from "./money";
import type { Company, Invoice, InvoiceLine, Journal } from "./types";

export type Totals = { ex: number; vat: number; incl: number };

export function lineBase(line: InvoiceLine): number {
  return round2(line.qty * line.unitExVat);
}

export function invoiceTotals(lines: InvoiceLine[], forceZeroVat = false): Totals {
  let ex = 0;
  let vat = 0;
  for (const line of lines) {
    const base = lineBase(line);
    const rate = forceZeroVat ? 0 : line.vatRate;
    ex += base;
    vat += round2((base * rate) / 100);
  }
  ex = round2(ex);
  vat = round2(vat);
  return { ex, vat, incl: round2(ex + vat) };
}

export type FiscalRange = { start: string; end: string; label: string };

export function fiscalYearRange(today: Date, yearEndMonth: number): FiscalRange {
  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  const endMonth = Math.min(12, Math.max(1, yearEndMonth || 12));
  if (endMonth === 12) {
    return { start: `${year}-01-01`, end: `${year}-12-31`, label: String(year) };
  }
  const endYear = month <= endMonth ? year : year + 1;
  const startYear = endYear - 1;
  const startMonth = endMonth + 1;
  const start = `${startYear}-${String(startMonth).padStart(2, "0")}-01`;
  const endDay = new Date(endYear, endMonth, 0).getDate();
  const end = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
  return { start, end, label: `${startYear}–${endYear}` };
}

export function inRange(iso: string, range: FiscalRange): boolean {
  return iso >= range.start && iso <= range.end;
}

export type SideRow = { code: string; name: string; amount: number };

export type Snapshot = {
  range: FiscalRange;
  income: number;
  expense: number;
  profit: number;
  cash: number;
  receivables: number;
  payables: number;
  vatPayable: number;
  vatRecoverable: number;
  vatNet: number;
  prepayments: number;
  directorPay: number;
  estimatedTax: number;
  taxNote: string;
  byMonth: { key: string; label: string; income: number; expense: number }[];
  expensesByAccount: { code: string; name: string; amount: number }[];
  assets: SideRow[];
  liabilities: SideRow[];
  equity: SideRow[];
  assetTotal: number;
  liabilityTotal: number;
  equityTotal: number;
  result: number;
  priorResult: number;
  gap: number;
};

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function netOf(map: Map<string, { debit: number; credit: number }>, code: string, kind: "debit" | "credit"): number {
  const row = map.get(code);
  if (!row) return 0;
  const raw = kind === "debit" ? row.debit - row.credit : row.credit - row.debit;
  return round2(raw);
}

export function isCompanyForm(form: string | undefined): boolean {
  return form === "bv" || form === "vof" || form === "commv";
}

export function estimateTax(profit: number, directorPay: number, legalForm: string | undefined): { tax: number; note: string } {
  if (profit <= 0) {
    return { tax: 0, note: "Geen winst, geen vennootschapsbelasting op dit resultaat." };
  }
  if (!isCompanyForm(legalForm)) {
    return {
      tax: 0,
      note: "Een eenmanszaak betaalt personenbelasting, geen vennootschapsbelasting. De schijven zijn progressief. KADE rekent hier geen percentage op, dat zou een schijnzekerheid zijn.",
    };
  }
  const reduced = directorPay + 0.005 >= 50000;
  if (reduced) {
    const slice = Math.min(profit, 100000);
    const rest = Math.max(0, profit - 100000);
    const tax = round2(slice * 0.2 + rest * 0.25);
    return {
      tax,
      note: "Kleine vennootschap, bestuurdersbezoldiging minstens 50.000 euro: 20% op de eerste 100.000 winst, 25% daarboven. Boekhoudkundige winst is nog geen belastbare grondslag.",
    };
  }
  return {
    tax: round2(profit * 0.25),
    note: "Zonder bestuurdersbezoldiging van minstens 50.000 euro (2026) valt het verlaagd tarief weg. Dan is het gewone tarief 25% op de hele winst, onder voorbehoud van de andere voorwaarden.",
  };
}

export function buildSnapshot(journals: Journal[], company: Company | null, today = new Date()): Snapshot {
  const range = fiscalYearRange(today, company?.yearEndMonth ?? 12);
  const bs = new Map<string, { debit: number; credit: number }>();
  const pnl = new Map<string, { debit: number; credit: number }>();
  const prior = new Map<string, { debit: number; credit: number }>();
  const monthIncome = new Map<string, number>();
  const monthExpense = new Map<string, number>();

  const add = (map: Map<string, { debit: number; credit: number }>, code: string, debit: number, credit: number) => {
    const row = map.get(code) ?? { debit: 0, credit: 0 };
    row.debit = round2(row.debit + debit);
    row.credit = round2(row.credit + credit);
    map.set(code, row);
  };

  for (const journal of journals) {
    const current = inRange(journal.bookedOn, range);
    for (const line of journal.lines) {
      const kind = accountKind(line.account);
      if (kind === "income" || kind === "expense") {
        add(current ? pnl : prior, line.account, line.debit, line.credit);
        if (current) {
          const key = journal.bookedOn.slice(0, 7);
          if (kind === "income") monthIncome.set(key, round2((monthIncome.get(key) ?? 0) + line.credit - line.debit));
          else monthExpense.set(key, round2((monthExpense.get(key) ?? 0) + line.debit - line.credit));
        }
      } else {
        add(bs, line.account, line.debit, line.credit);
      }
    }
  }

  let income = 0;
  let expense = 0;
  for (const [code, row] of pnl) {
    if (accountKind(code) === "income") income = round2(income + row.credit - row.debit);
    else expense = round2(expense + row.debit - row.credit);
  }
  let priorIncome = 0;
  let priorExpense = 0;
  for (const [code, row] of prior) {
    if (accountKind(code) === "income") priorIncome = round2(priorIncome + row.credit - row.debit);
    else priorExpense = round2(priorExpense + row.debit - row.credit);
  }
  const profit = round2(income - expense);
  const priorResult = round2(priorIncome - priorExpense);
  const directorPay = netOf(pnl, "6200", "debit");
  const tax = estimateTax(profit, directorPay, company?.legalForm);

  const assets: SideRow[] = [];
  const liabilities: SideRow[] = [];
  const equity: SideRow[] = [];
  for (const [code, row] of bs) {
    const kind = accountKind(code);
    const name = accountName(code);
    if (kind === "asset") {
      const amount = round2(row.debit - row.credit);
      if (Math.abs(amount) >= 0.005) assets.push({ code, name, amount });
    } else if (kind === "liability") {
      const amount = round2(row.credit - row.debit);
      if (Math.abs(amount) >= 0.005) liabilities.push({ code, name, amount });
    } else if (kind === "equity") {
      const amount = round2(row.credit - row.debit);
      if (Math.abs(amount) >= 0.005) equity.push({ code, name, amount });
    }
  }
  if (Math.abs(priorResult) >= 0.005) {
    equity.push({ code: "14xx", name: "Resultaat vorige boekjaren", amount: priorResult });
  }
  assets.sort((a, b) => a.code.localeCompare(b.code));
  liabilities.sort((a, b) => a.code.localeCompare(b.code));
  equity.sort((a, b) => a.code.localeCompare(b.code));

  const sum = (rows: SideRow[]) => round2(rows.reduce((s, r) => s + r.amount, 0));
  const assetTotal = sum(assets);
  const liabilityTotal = sum(liabilities);
  const equityTotal = sum(equity);
  const gap = round2(assetTotal - liabilityTotal - equityTotal - profit);

  const expensesByAccount = [...pnl.entries()]
    .filter(([code]) => accountKind(code) === "expense")
    .map(([code, row]) => ({ code, name: accountName(code), amount: round2(row.debit - row.credit) }))
    .filter((r) => r.amount !== 0)
    .sort((a, b) => b.amount - a.amount);

  const keys = new Set([...monthIncome.keys(), ...monthExpense.keys()]);
  const byMonth = [...keys].sort().map((key) => {
    const m = Number(key.slice(5, 7)) - 1;
    return {
      key,
      label: MONTHS[m] ?? key,
      income: monthIncome.get(key) ?? 0,
      expense: monthExpense.get(key) ?? 0,
    };
  });

  const vatPayable = netOf(bs, "4510", "credit");
  const vatRecoverable = netOf(bs, "4110", "debit");

  return {
    range,
    income,
    expense,
    profit,
    cash: netOf(bs, "5500", "debit"),
    receivables: netOf(bs, "4000", "debit"),
    payables: netOf(bs, "4400", "credit"),
    vatPayable,
    vatRecoverable,
    vatNet: round2(vatPayable - vatRecoverable),
    prepayments: netOf(bs, "4120", "debit"),
    directorPay,
    estimatedTax: tax.tax,
    taxNote: tax.note,
    byMonth,
    expensesByAccount,
    assets,
    liabilities,
    equity,
    assetTotal,
    liabilityTotal,
    equityTotal,
    result: profit,
    priorResult,
    gap,
  };
}

export function snapshotBrief(snapshot: Snapshot, company: Company | null, invoices: Invoice[]): string {
  const open = invoices.filter((i) => i.status === "sent");
  const lines = [
    `Zaak: ${company?.name ?? "nog geen bedrijfsfiche"} (${company?.legalForm ?? "onbekend"}, btw ${company?.vatRegime ?? "onbekend"}).`,
    `Boekjaar ${snapshot.range.label}.`,
    `Omzet ${snapshot.income.toFixed(2)} EUR, kosten ${snapshot.expense.toFixed(2)} EUR, resultaat ${snapshot.profit.toFixed(2)} EUR.`,
    `Bank ${snapshot.cash.toFixed(2)} EUR. Vorderingen ${snapshot.receivables.toFixed(2)} EUR. Leveranciers ${snapshot.payables.toFixed(2)} EUR.`,
    `Btw te betalen ${snapshot.vatPayable.toFixed(2)}, terug te vorderen ${snapshot.vatRecoverable.toFixed(2)}, netto ${snapshot.vatNet.toFixed(2)}.`,
    `Voorafbetalingen ${snapshot.prepayments.toFixed(2)}. Bezoldigingen geboekt ${snapshot.directorPay.toFixed(2)}.`,
    `Geschatte belasting (vereenvoudigd) ${snapshot.estimatedTax.toFixed(2)}. ${snapshot.taxNote}`,
    open.length
      ? `Openstaande facturen: ${open.map((i) => `${i.number} ${i.clientName} vervalt ${i.dueDate}`).join("; ")}.`
      : "Geen openstaande facturen.",
  ];
  return lines.join("\n");
}

export function ogmFromSequence(n: number): string {
  const base = String(Math.abs(Math.trunc(n)) % 10_000_000_000).padStart(10, "0");
  let mod = 0;
  for (const ch of base) mod = (mod * 10 + Number(ch)) % 97;
  if (mod === 0) mod = 97;
  const full = base + String(mod).padStart(2, "0");
  return `+++${full.slice(0, 3)}/${full.slice(3, 7)}/${full.slice(7)}+++`;
}
