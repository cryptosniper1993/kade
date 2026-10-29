export type AccountKind = "asset" | "liability" | "equity" | "expense" | "income";

export type Account = {
  code: string;
  name: string;
  kind: AccountKind;
};

export const ACCOUNTS: Account[] = [
  { code: "1000", name: "Inbreng", kind: "equity" },
  { code: "1400", name: "Overgedragen resultaat", kind: "equity" },
  { code: "2200", name: "Rollend materieel", kind: "asset" },
  { code: "2210", name: "Software", kind: "asset" },
  { code: "2400", name: "Informaticamateriaal", kind: "asset" },
  { code: "2500", name: "Kantoorinrichting", kind: "asset" },
  { code: "4000", name: "Handelsvorderingen", kind: "asset" },
  { code: "4110", name: "Terug te vorderen btw", kind: "asset" },
  { code: "4120", name: "Voorafbetalingen VenB", kind: "asset" },
  { code: "4400", name: "Handelsschulden", kind: "liability" },
  { code: "4510", name: "Te betalen btw", kind: "liability" },
  { code: "4550", name: "Geraamde belastingen", kind: "liability" },
  { code: "5500", name: "Bank", kind: "asset" },
  { code: "6100", name: "Huur en lease", kind: "expense" },
  { code: "6110", name: "Software en cloud", kind: "expense" },
  { code: "6120", name: "Hardware", kind: "expense" },
  { code: "6130", name: "Telecom", kind: "expense" },
  { code: "6140", name: "Marketing", kind: "expense" },
  { code: "6150", name: "Verplaatsingen", kind: "expense" },
  { code: "6160", name: "Kantoor", kind: "expense" },
  { code: "6170", name: "Onderaanneming", kind: "expense" },
  { code: "6180", name: "Opleiding", kind: "expense" },
  { code: "6200", name: "Bezoldigingen", kind: "expense" },
  { code: "6300", name: "Afschrijvingen", kind: "expense" },
  { code: "6400", name: "Diverse kosten", kind: "expense" },
  { code: "7000", name: "Omzet diensten", kind: "income" },
];

const BY_CODE = new Map(ACCOUNTS.map((a) => [a.code, a]));

export function accountName(code: string): string {
  return BY_CODE.get(code)?.name ?? "Onbekende rekening";
}

export function accountKind(code: string): AccountKind {
  const known = BY_CODE.get(code);
  if (known) return known.kind;
  if (code.startsWith("6")) return "expense";
  if (code.startsWith("7")) return "income";
  if (code.startsWith("1")) return "equity";
  if (code.startsWith("44") || code.startsWith("45")) return "liability";
  if (code.startsWith("2") || code.startsWith("3") || code.startsWith("5")) return "asset";
  if (code.startsWith("40") || code.startsWith("41")) return "asset";
  return "asset";
}

export const EXPENSE_ACCOUNTS = ACCOUNTS.filter((a) => a.kind === "expense");

export function isKnownAccount(code: string): boolean {
  return BY_CODE.has(code);
}
