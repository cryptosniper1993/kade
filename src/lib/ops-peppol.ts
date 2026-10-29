/**
 * Peppol via een erkende access point (Peppol-dienstverlener).
 * Kade praat met één generieke REST-adapter. API-sleutel en URL staan enkel
 * server-side (PEPPOL_API_URL, PEPPOL_API_KEY, optioneel PEPPOL_PROVIDER).
 * Zonder account bij een provider wordt er niets verzonden en ook geen succes gemeld.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { asLines, db, mapCompany, mapParty, str } from "@/lib/ops-shared";
import { env } from "@/lib/env.server";
import { adapter, NOT_CONNECTED } from "@/lib/peppol-adapter.server";
import { asTreatment } from "@/lib/invoicing";
import { buildPeppolUbl, countryCode, parsePeppolId, peppolIdFromKbo, peppolProblems, sellerFromCompany } from "@/lib/peppol";
import type { PeppolInput } from "@/lib/peppol";


export const peppolConfig = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const a = adapter();
    const url = env("PEPPOL_API_URL");
    let host = "";
    try { host = url ? new URL(url).host : ""; } catch { host = ""; }
    return { configured: Boolean(a), provider: a?.provider ?? "", host };
  });

export const testPeppol = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => {
    const a = adapter();
    if (!a) return { ok: false as const, message: NOT_CONNECTED };
    try {
      await a.test();
      return { ok: true as const, message: `Verbonden met ${a.provider}.` };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Verbinding mislukt." };
    }
  });

export const lookupPeppol = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => str((input as { peppolId?: string })?.peppolId, 60))
  .handler(async ({ data }) => {
    if (!parsePeppolId(data)) return { ok: false as const, message: "Geen geldig Peppol-ID (bv. 0208:0123456789)." };
    const a = adapter();
    if (!a) return { ok: false as const, message: `${NOT_CONNECTED} Je kan intussen manueel opzoeken in de Peppol Directory (directory.peppol.eu).` };
    try {
      const yes = await a.isReceiver(data);
      return { ok: true as const, receiver: yes, message: yes ? "Deze klant ontvangt via Peppol." : "Niet gevonden op Peppol." };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Opzoeken mislukt." };
    }
  });

async function buildFor(userId: string, id: string): Promise<{ input: PeppolInput; xml: string; number: string }> {
  const sql = await db();
  const rows = await sql<Record<string, unknown>>`
    select id, number, client_id, client_name, client_vat, client_address, issue_date::text as issue_date,
           due_date::text as due_date, notes, lines, kind, credit_of, vat_treatment, ogm
    from invoices where id = ${id} and user_id = ${userId}`;
  const row = rows[0];
  if (!row) throw new Error("Factuur niet gevonden.");
  const companies = await sql<Record<string, unknown>>`select * from companies where user_id = ${userId}`;
  const company = mapCompany(companies[0]);
  if (!company) throw new Error("Vul eerst de zaakfiche in.");
  const clientRows = row.client_id
    ? await sql<Record<string, unknown>>`select * from clients where id = ${str(row.client_id, 80)} and user_id = ${userId}`
    : [];
  const client = clientRows[0] ? mapParty(clientRows[0]) : null;
  const vat = client?.vatNumber || str(row.client_vat, 32);
  const number = str(row.number, 40);
  const kind = str(row.kind, 10) === "credit" ? ("credit" as const) : ("invoice" as const);
  const of = kind === "credit" && row.credit_of
    ? await sql<{ number: string }>`select number from invoices where id = ${str(row.credit_of, 80)} and user_id = ${userId}`
    : [];
  const creditOf = of[0]?.number ?? "";
  const input: PeppolInput = {
    invoice: {
      number,
      issueDate: str(row.issue_date, 10),
      dueDate: str(row.due_date, 10),
      notes: str(row.notes, 800),
      lines: asLines(row.lines),
    },
    seller: sellerFromCompany(company),
    buyer: {
      name: client?.name || str(row.client_name, 160),
      vatNumber: vat,
      peppolId: client?.peppolId || peppolIdFromKbo(vat),
      street: client?.address || str(row.client_address, 200),
      postalCode: client?.postalCode || "",
      city: client?.city || "",
      countryCode: countryCode(client?.country || ""),
    },
    iban: company.iban,
    paymentReference: str(row.ogm, 30),
    exempt: company.vatRegime === "exempt",
    kind,
    creditOf,
    treatment: asTreatment(row.vat_treatment),
  };
  return { input, xml: buildPeppolUbl(input), number };
}

const idInput = (input: unknown) => {
  const id = str((input as { id?: string })?.id, 80);
  if (!id) throw new Error("Factuur ontbreekt.");
  return id;
};

export const getInvoiceUbl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(async ({ context, data }) => {
    const { input, xml, number } = await buildFor(context.userId, data);
    return { filename: `${number || "factuur"}.xml`, xml, problems: peppolProblems(input) };
  });

export const sendInvoicePeppol = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const userId = context.userId;
    const status = await sql<{ status: string; peppol_status: string }>`
      select status, peppol_status from invoices where id = ${data} and user_id = ${userId}`;
    if (!status[0]) throw new Error("Factuur niet gevonden.");
    if (status[0].status === "draft") return { ok: false as const, message: "Boek de factuur eerst definitief." };
    if (status[0].peppol_status === "verzonden") return { ok: true as const, message: "Deze factuur ging al via Peppol." };
    const a = adapter();
    if (!a) return { ok: false as const, notConnected: true, message: NOT_CONNECTED };
    const { input, xml } = await buildFor(userId, data);
    const problems = peppolProblems(input);
    const mark = async (s: "verzonden" | "fout", message: string, ref = "") => {
      await sql`update invoices set peppol_status = ${s}, peppol_message = ${message.slice(0, 400)}, peppol_ref = ${ref},
        peppol_sent_at = ${s === "verzonden" ? new Date().toISOString() : null} where id = ${data} and user_id = ${userId}`;
    };
    if (problems.length) {
      await mark("fout", problems.join(" "));
      return { ok: false as const, message: problems.join(" ") };
    }
    try {
      const { ref } = await a.send(xml, input.buyer.peppolId, input.seller.peppolId);
      await mark("verzonden", `Aangeleverd bij ${a.provider}${ref ? ` (${ref})` : ""}.`, ref);
      return { ok: true as const, message: `Verstuurd via Peppol naar ${input.buyer.peppolId}.` };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verzenden mislukt.";
      await mark("fout", message);
      return { ok: false as const, message };
    }
  });
