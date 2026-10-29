import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requirePermission } from "@/lib/auth/permissions";
import { asLines, db, mapCompany, str } from "@/lib/ops-shared";
import { asTreatment } from "@/lib/invoicing";
import {
  clientListing,
  clientListingXml,
  exemptTurnover,
  icListing,
  icListingXml,
  intervatVatXml,
  vatGrids,
  type Declarant,
  type Period,
  type Purchase,
  type Sale,
} from "@/lib/vatreturn";
import { exemptThreshold } from "@/lib/tax";

/** Btw-aangifte, klantenlisting, IC-opgave en omzetopgave voorbereiden uit uitgereikte facturen en geboekte aankopen. */
export const prepareVatReturn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown): Period => {
    const row = (input ?? {}) as Partial<Period>;
    const year = Math.trunc(Number(row.year));
    if (!(year >= 2000 && year <= 2100)) throw new Error("Kies een geldig jaar.");
    const quarter = row.quarter ? Math.min(4, Math.max(1, Math.trunc(Number(row.quarter)))) : undefined;
    const month = row.month ? Math.min(12, Math.max(1, Math.trunc(Number(row.month)))) : undefined;
    return { year, quarter, month };
  })
  .handler(async ({ context, data }) => {
    requirePermission(context, "btw");
    const sql = await db();
    const userId = context.userId;
    const company = mapCompany((await sql<Record<string, unknown>>`select * from companies where user_id = ${userId}`)[0]);
    if (!company) throw new Error("Vul eerst de zaakfiche in.");
    const exempt = company.vatRegime === "exempt";
    const rows = await sql<Record<string, unknown>>`
      select kind, vat_treatment, issue_date::text as issue_date, client_name, client_vat, lines
      from invoices where user_id = ${userId} and status <> 'draft' and demo = false`;
    const sales: Sale[] = rows.map((r) => ({
      kind: str(r.kind, 10) === "credit" ? "credit" : "invoice",
      treatment: asTreatment(r.vat_treatment),
      issueDate: str(r.issue_date, 10),
      clientName: str(r.client_name, 160),
      clientVat: str(r.client_vat, 32),
      lines: asLines(r.lines),
    }));
    const pRows = await sql<Record<string, unknown>>`
      select kind, issue_date, total_ex_vat, total_vat from incoming_invoices where user_id = ${userId} and booked = true`;
    const purchases: Purchase[] = pRows.map((r) => ({
      kind: str(r.kind, 12) === "creditnote" ? "creditnote" : "invoice",
      issueDate: str(r.issue_date, 10),
      totalExVat: Number(r.total_ex_vat) || 0,
      totalVat: Number(r.total_vat) || 0,
    }));
    const m = /^\s*(\d{4})\s+(.*)$/.exec(company.city || "");
    const d: Declarant = {
      vatNumber: company.vatNumber || company.enterpriseNumber,
      name: company.name,
      street: company.address,
      postCode: m ? m[1] : "",
      city: m ? m[2] : company.city,
      email: company.email,
    };
    const grids = vatGrids(sales, purchases, data, exempt);
    const listing = clientListing(sales, data.year, exempt);
    const ic = icListing(sales, data);
    const turnover = exemptTurnover(sales, data.year);
    const tag = data.month ? `${data.year}-M${data.month}` : data.quarter ? `${data.year}-Q${data.quarter}` : `${data.year}`;
    return {
      exempt,
      grids,
      listing,
      ic,
      turnover,
      threshold: exemptThreshold(data.year, company.exemptThreshold),
      files: [
        ...(exempt || (!data.quarter && !data.month) ? [] : [{ filename: `btw-aangifte-${tag}.xml`, xml: intervatVatXml(d, data, grids) }]),
        { filename: `klantenlisting-${data.year}.xml`, xml: clientListingXml(d, data.year, listing) },
        ...(ic.length && (data.quarter || data.month) ? [{ filename: `ic-opgave-${tag}.xml`, xml: icListingXml(d, data, ic) }] : []),
      ],
    };
  });
