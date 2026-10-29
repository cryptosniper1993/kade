import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { invoiceTotals, lineBase } from "./finance";
import type { Company, InvoiceLine } from "./types";

/** Eenvoudige A4-pdf voor factuur of offerte (bijlage bij mail). WinAnsi-tekens; rest wordt vervangen. */
export interface DocPdf {
  kind: "factuur" | "offerte";
  number: string;
  issueDate: string;
  dueLabel: string;
  dueDate: string;
  clientName: string;
  clientVat: string;
  clientAddress: string;
  notes: string;
  lines: InvoiceLine[];
  company: Company | null;
  exempt: boolean;
}

const eur = (n: number) => `EUR ${n.toFixed(2).replace(".", ",")}`;
const ansi = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7e\xa0-\xff\n]/g, "?");

export async function renderDocPdf(d: DocPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${d.kind} ${d.number}`);
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0x10 / 255, 0x41 / 255, 0x76 / 255);
  let y = 790;
  const text = (s: string, x: number, size = 10, f = font, color = rgb(0.1, 0.1, 0.1)) => {
    for (const line of ansi(s).split("\n")) { page.drawText(line, { x, y, size, font: f, color }); y -= size + 4; }
  };
  const c = d.company;
  text(c?.name || "", 50, 16, bold, navy);
  if (c) text([c.address, c.city, c.vatNumber ? `Btw ${c.vatNumber}` : `KBO ${c.enterpriseNumber}`, c.email].filter(Boolean).join("\n"), 50, 9);
  y -= 16;
  text(`${d.kind === "factuur" ? "Factuur" : "Offerte"} ${d.number}`, 50, 20, bold, navy);
  text(`Datum ${d.issueDate}   ·   ${d.dueLabel} ${d.dueDate}`.replace("·", "-"), 50, 10);
  y -= 8;
  text(d.clientName, 50, 11, bold);
  text([d.clientAddress, d.clientVat ? `Btw ${d.clientVat}` : ""].filter(Boolean).join("\n"), 50, 9);
  y -= 14;
  page.drawRectangle({ x: 50, y: y - 4, width: 495, height: 18, color: rgb(0.93, 0.95, 0.98) });
  const row = (cols: string[], f = font) => {
    const xs = [55, 330, 380, 450];
    cols.forEach((v, i) => {
      const s = ansi(v).slice(0, i === 0 ? 48 : 20);
      const w = i === 0 ? 0 : f.widthOfTextAtSize(s, 9);
      page.drawText(s, { x: i === 0 ? xs[0] : xs[i] + 85 - w - (i === 3 ? 0 : 20), y, size: 9, font: f });
    });
    y -= 16;
  };
  row(["Omschrijving", "Aantal", "Btw", "Bedrag excl."], bold);
  for (const l of d.lines) row([l.description, String(l.qty), d.exempt ? "0%" : `${l.vatRate}%`, eur(lineBase(l))]);
  const t = invoiceTotals(d.lines, d.exempt);
  y -= 8;
  row(["", "", "Excl. btw", eur(t.ex)], bold);
  row(["", "", "Btw", eur(t.vat)], bold);
  row(["", "", "Totaal", eur(t.incl)], bold);
  y -= 10;
  if (d.exempt) text("Bijzondere vrijstellingsregeling kleine ondernemingen.", 50, 9);
  if (d.kind === "factuur" && c?.iban) text(`Betaling op ${c.iban} met vermelding ${d.number}.`, 50, 9);
  if (d.notes) { y -= 6; text(d.notes.slice(0, 1200), 50, 9); }
  return pdf.save();
}
