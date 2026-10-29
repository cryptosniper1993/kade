import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  DEFAULT_BOTS,
  LOOTS,
  SCHAAR,
  asLines,
  contextPack,
  dateStr,
  db,
  grok,
  hasRef,
  insertJournal,
  mapCompany,
  mapMessage,
  mapParty,
  mapSupplier,
  mapVoice,
  num,
  readJournals,
  str,
  uid,
} from "@/lib/ops-shared";
import { accountName, isKnownAccount } from "@/lib/accounts";
import { invoiceTotals, ogmFromSequence } from "@/lib/finance";
import { round2 } from "@/lib/money";
import { readWork } from "@/lib/work";
import { readFleet } from "@/lib/fleet";
import { brusselsToday } from "@/lib/day";
import { personName, priorityQueue, projectName } from "@/lib/briefing";
import { daysUntil, fleetSnapshot } from "@/lib/assets";
import { clamp, flag } from "@/lib/ops-shared";
import type { Bot, Company, Desk, Invoice, InvoiceLine, LegalForm, VatRegime, VoiceSettings } from "@/lib/types";


export const loadDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Desk> => {
    const sql = await db();
    const userId = context.userId;
    const botCount = await sql<{ n: number }>`select count(*)::int as n from bots where user_id = ${userId}`;
    if ((botCount[0]?.n ?? 0) === 0) {
      for (const bot of DEFAULT_BOTS) {
        await sql`
          insert into bots (id, user_id, name, role, brief, followed)
          values (${uid()}, ${userId}, ${bot.name}, ${bot.role}, ${bot.brief}, true)`;
      }
    }
    const schaar = await sql<{ n: number }>`select count(*)::int as n from bots where user_id = ${userId} and name = 'Schaar'`;
    if ((schaar[0]?.n ?? 0) === 0) {
      const seeded = DEFAULT_BOTS.find((bot) => bot.name === "Schaar");
      if (seeded) {
        await sql`
          insert into bots (id, user_id, name, role, brief, followed)
          values (${uid()}, ${userId}, ${seeded.name}, ${seeded.role}, ${seeded.brief}, true)`;
      }
    }
    const settings = await sql<Record<string, unknown>>`
      select brand, agent_name, voice_uri, voice_lang, voice_rate, voice_pitch, voice_volume, auto_speak, send_on_listen
      from desk_settings where user_id = ${userId}`;
    const companies = await sql<Record<string, unknown>>`select * from companies where user_id = ${userId}`;
    const clients = await sql<Record<string, unknown>>`
      select id, name, vat_number, email, phone, contact, address, postal_code, city, country,
             pay_days, iban, note, active, demo
      from clients where user_id = ${userId} order by name asc`;
    const suppliers = await sql<Record<string, unknown>>`
      select id, name, vat_number, email, phone, contact, address, postal_code, city, country,
             pay_days, iban, account, note, active
      from suppliers where user_id = ${userId} order by name asc`;
    const invoices = await sql<Record<string, unknown>>`
      select id, number, client_id, client_name, client_vat, client_address,
             issue_date::text as issue_date, due_date::text as due_date, status, notes, lines, demo
      from invoices where user_id = ${userId} order by issue_date desc, number desc`;
    const documents = await sql<Record<string, unknown>>`
      select id, filename, mime, kind, vendor, doc_date::text as doc_date, amount_eur, note, demo,
             created_at::text as created_at, client_id, supplier_id
      from documents where user_id = ${userId} order by created_at desc`;
    const bots = await sql<Record<string, unknown>>`
      select id, name, role, brief, followed, status, task, last_result
      from bots where user_id = ${userId} order by name asc`;
    const researches = await sql<Record<string, unknown>>`
      select id, title, question, answer, created_at::text as created_at
      from researches where user_id = ${userId} order by created_at desc limit 60`;
    const messages = await sql<Record<string, unknown>>`
      select id, role, content, created_at::text as created_at from agent_messages
      where user_id = ${userId} and channel = 'loots' order by created_at asc limit 40`;
    const fiscal = await sql<Record<string, unknown>>`
      select id, role, content, created_at::text as created_at from agent_messages
      where user_id = ${userId} and channel = 'schaar' order by created_at asc limit 40`;
    const hoofd = await sql<Record<string, unknown>>`
      select id, role, content, created_at::text as created_at from agent_messages
      where user_id = ${userId} and channel = 'hoofd' order by created_at asc limit 40`;
    const runs = await sql<Record<string, unknown>>`
      select id, bot_name, task, result, created_at::text as created_at
      from bot_runs where user_id = ${userId} order by created_at desc limit 60`;
    const journals = await readJournals(sql, userId);
    const work = await readWork(sql, userId);
    const fleet = await readFleet(sql, userId);
    return {
      company: mapCompany(companies[0]),
      clients: clients.map(mapParty),
      suppliers: suppliers.map(mapSupplier),
      invoices: invoices.map((row) => ({
        id: str(row.id, 80),
        number: str(row.number, 40),
        clientId: row.client_id ? str(row.client_id, 80) : null,
        clientName: str(row.client_name, 160),
        clientVat: str(row.client_vat, 32),
        clientAddress: str(row.client_address, 200),
        issueDate: str(row.issue_date, 10),
        dueDate: str(row.due_date, 10),
        status: (["draft", "sent", "paid"].includes(str(row.status, 12)) ? str(row.status, 12) : "draft") as Invoice["status"],
        notes: str(row.notes, 800),
        lines: asLines(row.lines),
        demo: Boolean(row.demo),
      })),
      journals,
      documents: documents.map((row) => ({
        id: str(row.id, 80),
        filename: str(row.filename, 180),
        mime: str(row.mime, 80),
        kind: str(row.kind, 40),
        vendor: str(row.vendor, 160),
        docDate: row.doc_date ? str(row.doc_date, 10) : null,
        amountEur: row.amount_eur == null ? null : num(row.amount_eur),
        note: str(row.note, 400),
        demo: Boolean(row.demo),
        createdAt: str(row.created_at, 40),
        clientId: row.client_id ? str(row.client_id, 80) : null,
        supplierId: row.supplier_id ? str(row.supplier_id, 80) : null,
      })),
      bots: bots.map((row) => ({
        id: str(row.id, 80),
        name: str(row.name, 80),
        role: str(row.role, 60),
        brief: str(row.brief, 600),
        followed: Boolean(row.followed),
        status: str(row.status, 20),
        task: str(row.task, 2000),
        lastResult: str(row.last_result, 8000),
      })),
      researches: researches.map((row) => ({
        id: str(row.id, 80),
        title: str(row.title, 140),
        question: str(row.question, 4000),
        answer: str(row.answer, 8000),
        createdAt: str(row.created_at, 40),
      })),
      messages: messages.map(mapMessage),
      fiscal: fiscal.map(mapMessage),
      hoofd: hoofd.map(mapMessage),
      runs: runs.map((row) => ({
        id: str(row.id, 80),
        botName: str(row.bot_name, 80),
        task: str(row.task, 2000),
        result: str(row.result, 8000),
        createdAt: str(row.created_at, 40),
      })),
      brand: str(settings[0]?.brand, 24) || "KADE",
      voice: mapVoice(settings[0]),
      people: work.people,
      projects: work.projects,
      tasks: work.tasks,
      assets: fleet.assets,
      incidents: fleet.incidents,
      briefing: work.briefing,
    };
  });

type CompanyInput = Company;

function parseCompany(input: unknown): CompanyInput {
  const row = (input ?? {}) as Partial<Company>;
  const name = str(row.name, 160);
  if (!name) throw new Error("De zaak heeft een naam nodig.");
  const form = str(row.legalForm, 20);
  const regime = str(row.vatRegime, 20);
  return {
    name,
    legalForm: (["bv", "eenmanszaak", "vof", "commv"].includes(form) ? form : "bv") as LegalForm,
    vatNumber: str(row.vatNumber, 32),
    enterpriseNumber: str(row.enterpriseNumber, 32),
    address: str(row.address, 180),
    city: str(row.city, 80),
    email: str(row.email, 160),
    iban: str(row.iban, 40),
    vatRegime: (["quarterly", "monthly", "exempt"].includes(regime) ? regime : "quarterly") as VatRegime,
    activityStatus: str(row.activityStatus, 20) === "hoofdberoep" ? "hoofdberoep" : "bijberoep",
    yearEndMonth: Math.min(12, Math.max(1, Number(row.yearEndMonth) || 12)),
  };
}

export const saveCompany = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseCompany(input))
  .handler(async ({ context, data }) => {
    const sql = await db();
    await sql`
      insert into companies (
        user_id, name, legal_form, vat_number, enterprise_number, address, city, email, iban, vat_regime, activity_status, year_end_month
      ) values (
        ${context.userId}, ${data.name}, ${data.legalForm}, ${data.vatNumber}, ${data.enterpriseNumber},
        ${data.address}, ${data.city}, ${data.email}, ${data.iban}, ${data.vatRegime}, ${data.activityStatus}, ${data.yearEndMonth}
      )
      on conflict (user_id) do update set
        name = excluded.name,
        legal_form = excluded.legal_form,
        vat_number = excluded.vat_number,
        enterprise_number = excluded.enterprise_number,
        address = excluded.address,
        city = excluded.city,
        email = excluded.email,
        iban = excluded.iban,
        vat_regime = excluded.vat_regime,
        activity_status = excluded.activity_status,
        year_end_month = excluded.year_end_month`;
    return { ok: true as const };
  });


