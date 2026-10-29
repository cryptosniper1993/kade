/**
 * Inkomende Peppol-facturen (aankoopfacturen): UBL 2.1 / BIS Billing 3.0 lezen.
 * Puur: geen netwerk, geen database, geen DOM (werkt in Node en in de browser). Getest in incoming.test.ts.
 */

export const INCOMING_STATUSES = ["nieuw", "goedgekeurd", "betaald", "betwist"] as const;
export type IncomingStatus = (typeof INCOMING_STATUSES)[number];

export type IncomingLine = { description: string; qty: number; unitExVat: number; netAmount: number; vatRate: number; vatCategory: string };
export type IncomingVat = { rate: number; category: string; base: number; tax: number };

export type ParsedIncoming = {
  kind: "invoice" | "creditnote";
  number: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  supplierName: string;
  supplierVat: string;
  supplierPeppolId: string;
  supplierAddress: string;
  supplierIban: string;
  paymentReference: string;
  buyerName: string;
  buyerPeppolId: string;
  notes: string;
  lines: IncomingLine[];
  vat: IncomingVat[];
  totalExVat: number;
  totalVat: number;
  totalInclVat: number;
  payable: number;
  pdf: { filename: string; mime: string; base64: string } | null;
};

export type IncomingInvoice = Omit<ParsedIncoming, "pdf"> & {
  id: string;
  status: IncomingStatus;
  source: "peppol" | "upload";
  providerRef: string;
  supplierId: string | null;
  hasPdf: boolean;
  pdfName: string;
  booked: boolean;
  paidOn: string;
  receivedAt: string;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .trim();
}

/** Lokale tagnaam (zonder namespaceprefix) als regex-deel. */
const tag = (name: string) => `(?:[A-Za-z0-9_]+:)?${name}`;

/** Alle blokken <prefix:Name ...>...</prefix:Name> op het eerste niveau waarin ze voorkomen. */
function blocks(xml: string, name: string): string[] {
  const out: string[] = [];
  const open = new RegExp(`<(${tag(name)})(\\s[^>]*)?(/?)>`, "g");
  let m: RegExpExecArray | null;
  while ((m = open.exec(xml))) {
    if (m[3] === "/") { out.push(""); continue; }
    const full = m[1];
    const start = m.index + m[0].length;
    // Zoek de passende sluittag, rekening houdend met nesting van dezelfde naam.
    const re = new RegExp(`<(/?)${full.replace(":", "\\:")}(\\s[^>]*)?(/?)>`, "g");
    re.lastIndex = start;
    let depth = 1;
    let n: RegExpExecArray | null;
    let end = -1;
    while ((n = re.exec(xml))) {
      if (n[3] === "/") continue;
      depth += n[1] === "/" ? -1 : 1;
      if (depth === 0) { end = n.index; open.lastIndex = re.lastIndex; break; }
    }
    if (end < 0) break;
    out.push(xml.slice(start, end));
  }
  return out;
}

function block(xml: string, ...path: string[]): string {
  let cur = xml;
  for (const p of path) {
    const b = blocks(cur, p)[0];
    if (b === undefined) return "";
    cur = b;
  }
  return cur;
}

function text(xml: string, ...path: string[]): string {
  const last = path[path.length - 1];
  const parent = path.length > 1 ? block(xml, ...path.slice(0, -1)) : xml;
  const m = new RegExp(`<${tag(last)}(\\s[^>]*)?>([\\s\\S]*?)</${tag(last)}>`).exec(parent);
  return m ? decode(m[2]) : "";
}

function attr(xml: string, name: string, attribute: string): string {
  const m = new RegExp(`<${tag(name)}\\s[^>]*?${attribute}="([^"]*)"`).exec(xml);
  return m ? decode(m[1]) : "";
}

function amount(xml: string, ...path: string[]): number {
  const n = Number(text(xml, ...path).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Strip bovenste niveau: de elementen van een kind-blok niet meenemen bij zoeken naar directe kinderen. */
function withoutBlocks(xml: string, ...names: string[]): string {
  let out = xml;
  for (const name of names) {
    out = out.replace(new RegExp(`<(${tag(name)})(\\s[^>]*)?>[\\s\\S]*?</\\1>`, "g"), "");
  }
  return out;
}

function partyOf(xml: string) {
  const party = block(xml, "Party");
  const endpoint = (() => {
    const m = new RegExp(`<${tag("EndpointID")}(\\s[^>]*)?>([\\s\\S]*?)</${tag("EndpointID")}>`).exec(party);
    if (!m) return "";
    const scheme = /schemeID="([^"]*)"/.exec(m[1] ?? "")?.[1] ?? "";
    const value = decode(m[2]);
    return scheme ? `${scheme}:${value}` : value;
  })();
  const name = text(party, "PartyName", "Name") || text(party, "PartyLegalEntity", "RegistrationName");
  const vat = text(party, "PartyTaxScheme", "CompanyID") || text(party, "PartyLegalEntity", "CompanyID");
  const addr = block(party, "PostalAddress");
  const address = [
    text(addr, "StreetName"),
    [text(addr, "PostalZone"), text(addr, "CityName")].filter(Boolean).join(" "),
    text(addr, "Country", "IdentificationCode"),
  ].filter(Boolean).join(", ");
  return { name, vat, endpoint, address };
}

/** Leest een UBL Invoice of CreditNote. Gooit een fout als het geen UBL-factuur is. */
export function parseIncomingUbl(xmlInput: string): ParsedIncoming {
  const xml = String(xmlInput ?? "").replace(/^\uFEFF/, "").replace(/<!--[\s\S]*?-->/g, "");
  const root = /<(?:[A-Za-z0-9_]+:)?(Invoice|CreditNote)[\s>]/.exec(xml.replace(/<\?xml[^>]*\?>/, ""));
  if (!root) throw new Error("Dit is geen UBL-factuur (Invoice of CreditNote ontbreekt).");
  const kind = root[1] === "CreditNote" ? "creditnote" : "invoice";
  const body = blocks(xml, root[1])[0] ?? xml;
  const head = withoutBlocks(body, "InvoiceLine", "CreditNoteLine", "AccountingSupplierParty", "AccountingCustomerParty", "AdditionalDocumentReference", "PaymentMeans", "TaxTotal", "LegalMonetaryTotal", "PaymentTerms", "Delivery", "OrderReference", "BillingReference", "ContractDocumentReference", "InvoicePeriod");
  const number = text(head, "ID");
  if (!number) throw new Error("De factuur heeft geen nummer (cbc:ID).");
  const supplier = partyOf(block(body, "AccountingSupplierParty"));
  const buyer = partyOf(block(body, "AccountingCustomerParty"));
  if (!supplier.name) throw new Error("De leverancier ontbreekt in de UBL.");

  const lineTag = kind === "creditnote" ? "CreditNoteLine" : "InvoiceLine";
  const qtyTag = kind === "creditnote" ? "CreditedQuantity" : "InvoicedQuantity";
  const lines: IncomingLine[] = blocks(body, lineTag).map((l) => {
    const item = block(l, "Item");
    const cat = block(item, "ClassifiedTaxCategory");
    const top = withoutBlocks(l, "Item", "Price", "AllowanceCharge", "SubInvoiceLine", "OrderLineReference", "DocumentReference");
    const qty = amount(top, qtyTag) || 1;
    const net = amount(top, "LineExtensionAmount");
    const priceAmount = amount(block(l, "Price"), "PriceAmount");
    return {
      description: text(item, "Name") || text(item, "Description") || "Lijn",
      qty,
      unitExVat: priceAmount || r2(net / qty),
      netAmount: net,
      vatRate: Number(text(cat, "Percent")) || 0,
      vatCategory: text(cat, "ID") || "S",
    };
  });

  const taxTotals = blocks(body, "TaxTotal");
  const taxTotal = taxTotals.find((t) => /<(?:[A-Za-z0-9_]+:)?TaxSubtotal[\s>]/.test(t)) ?? taxTotals[0] ?? "";
  const vat: IncomingVat[] = blocks(taxTotal, "TaxSubtotal").map((s) => {
    const cat = block(s, "TaxCategory");
    return { rate: Number(text(cat, "Percent")) || 0, category: text(cat, "ID") || "S", base: amount(s, "TaxableAmount"), tax: amount(s, "TaxAmount") };
  });
  const money = block(body, "LegalMonetaryTotal");
  const totalExVat = amount(money, "TaxExclusiveAmount") || amount(money, "LineExtensionAmount") || r2(lines.reduce((s, l) => s + l.netAmount, 0));
  const totalVat = taxTotal ? amount(withoutBlocks(taxTotal, "TaxSubtotal"), "TaxAmount") : r2(vat.reduce((s, v) => s + v.tax, 0));
  const totalInclVat = amount(money, "TaxInclusiveAmount") || r2(totalExVat + totalVat);
  const payable = money && text(money, "PayableAmount") ? amount(money, "PayableAmount") : totalInclVat;

  const means = block(body, "PaymentMeans");
  let pdf: ParsedIncoming["pdf"] = null;
  for (const ref of blocks(body, "AdditionalDocumentReference")) {
    const m = new RegExp(`<${tag("EmbeddedDocumentBinaryObject")}(\\s[^>]*)?>([\\s\\S]*?)</${tag("EmbeddedDocumentBinaryObject")}>`).exec(ref);
    if (!m) continue;
    const mime = /mimeCode="([^"]*)"/.exec(m[1] ?? "")?.[1] ?? "";
    const filename = /filename="([^"]*)"/.exec(m[1] ?? "")?.[1] ?? "";
    if (mime === "application/pdf" || /\.pdf$/i.test(filename)) {
      pdf = { filename: decode(filename) || `${number}.pdf`, mime: "application/pdf", base64: m[2].replace(/\s+/g, "") };
      break;
    }
  }

  return {
    kind,
    number,
    issueDate: text(head, "IssueDate"),
    dueDate: text(head, "DueDate") || text(block(body, "PaymentTerms"), "PaymentDueDate") || text(means, "PaymentDueDate"),
    currency: text(head, "DocumentCurrencyCode") || attr(money, "PayableAmount", "currencyID") || "EUR",
    supplierName: supplier.name,
    supplierVat: supplier.vat,
    supplierPeppolId: supplier.endpoint,
    supplierAddress: supplier.address,
    supplierIban: text(means, "PayeeFinancialAccount", "ID").replace(/\s+/g, ""),
    paymentReference: text(means, "PaymentID"),
    buyerName: buyer.name,
    buyerPeppolId: buyer.endpoint,
    notes: text(head, "Note"),
    lines,
    vat,
    totalExVat,
    totalVat,
    totalInclVat,
    payable,
    pdf,
  };
}

/** Sleutel om dubbele ontvangst te herkennen: leverancier (btw/Peppol-ID/naam) + factuurnummer. */
export function dedupeKey(p: Pick<ParsedIncoming, "supplierVat" | "supplierPeppolId" | "supplierName" | "number" | "kind">): string {
  const who = (p.supplierVat || p.supplierPeppolId || p.supplierName).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const prefix = p.kind === "creditnote" ? "CN:" : "";
  return `${who}|${prefix}${p.number.trim().toUpperCase()}`;
}

/** Toegelaten statuswissels. */
export function canMoveIncoming(from: IncomingStatus, to: IncomingStatus): boolean {
  if (from === to) return false;
  if (from === "betaald") return false;
  if (to === "betaald") return from === "goedgekeurd" || from === "nieuw";
  return true;
}

/**
 * Boeking van een aankoopfactuur: kost (per btw-tarief) + aftrekbare btw aan leverancier (4400).
 * Bij vrijstelling (art. 56bis) is btw niet aftrekbaar en gaat ze mee in de kost.
 */
export function incomingJournalLines(p: Pick<ParsedIncoming, "kind" | "totalExVat" | "totalVat" | "payable">, account: string, exempt: boolean) {
  const sign = p.kind === "creditnote" ? -1 : 1;
  const vat = r2(p.totalVat);
  const cost = exempt ? r2(p.totalExVat + vat) : r2(p.totalExVat);
  const total = r2(cost + (exempt ? 0 : vat));
  const rows = [
    { account, debit: cost, credit: 0 },
    ...(!exempt && vat ? [{ account: "4110", debit: vat, credit: 0 }] : []),
    { account: "4400", debit: 0, credit: total },
  ];
  return sign > 0 ? rows : rows.map((r) => ({ account: r.account, debit: r.credit, credit: r.debit }));
}
