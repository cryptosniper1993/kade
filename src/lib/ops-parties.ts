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
import type { Bot, Company, Invoice, InvoiceLine, LegalForm, VatRegime, VoiceSettings } from "@/lib/types";

export const saveClient = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => partyInput(input, "klant"))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const id = data.id || uid();
    if (data.id) {
      const rows = await sql<{ id: string }>`select id from clients where id = ${id} and user_id = ${context.userId}`;
      if (!rows[0]) throw new Error("Klant niet gevonden.");
      await sql`
        update clients set name = ${data.name}, vat_number = ${data.vatNumber}, email = ${data.email},
          phone = ${data.phone}, contact = ${data.contact}, address = ${data.address}, postal_code = ${data.postalCode},
          city = ${data.city}, country = ${data.country}, pay_days = ${data.payDays}, iban = ${data.iban}, note = ${data.note},
          active = ${data.active}, peppol_id = ${data.peppolId}
        where id = ${id} and user_id = ${context.userId}`;
    } else {
      await sql`
        insert into clients (
          id, user_id, name, vat_number, email, phone, contact, address, postal_code, city, country,
          pay_days, iban, note, active, demo, peppol_id
        ) values (
          ${id}, ${context.userId}, ${data.name}, ${data.vatNumber}, ${data.email}, ${data.phone}, ${data.contact},
          ${data.address}, ${data.postalCode}, ${data.city}, ${data.country}, ${data.payDays}, ${data.iban},
          ${data.note}, ${data.active}, false, ${data.peppolId}
        )`;
    }
    return { id };
  });

export const saveSupplier = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const party = partyInput(input, "leverancier");
    const account = str((input as { account?: string })?.account, 8) || "6400";
    if (!isKnownAccount(account) || !account.startsWith("6")) throw new Error("Kies een kostenrekening.");
    return { ...party, account };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const id = data.id || uid();
    if (data.id) {
      const rows = await sql<{ id: string }>`select id from suppliers where id = ${id} and user_id = ${context.userId}`;
      if (!rows[0]) throw new Error("Leverancier niet gevonden.");
      await sql`
        update suppliers set name = ${data.name}, vat_number = ${data.vatNumber}, email = ${data.email},
          phone = ${data.phone}, contact = ${data.contact}, address = ${data.address}, postal_code = ${data.postalCode},
          city = ${data.city}, country = ${data.country}, pay_days = ${data.payDays}, iban = ${data.iban},
          account = ${data.account}, note = ${data.note}, active = ${data.active}
        where id = ${id} and user_id = ${context.userId}`;
    } else {
      await sql`
        insert into suppliers (
          id, user_id, name, vat_number, email, phone, contact, address, postal_code, city, country,
          pay_days, iban, account, note, active
        ) values (
          ${id}, ${context.userId}, ${data.name}, ${data.vatNumber}, ${data.email}, ${data.phone}, ${data.contact},
          ${data.address}, ${data.postalCode}, ${data.city}, ${data.country}, ${data.payDays}, ${data.iban},
          ${data.account}, ${data.note}, ${data.active}
        )`;
    }
    return { id };
  });

export const setPartyActive = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as { id?: string; kind?: string; active?: boolean };
    const id = str(row.id, 80);
    if (!id) throw new Error("Relatie ontbreekt.");
    return { id, kind: row.kind === "supplier" ? "supplier" as const : "client" as const, active: Boolean(row.active) };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    if (data.kind === "supplier") {
      await sql`update suppliers set active = ${data.active} where id = ${data.id} and user_id = ${context.userId}`;
    } else {
      await sql`update clients set active = ${data.active} where id = ${data.id} and user_id = ${context.userId}`;
    }
    return { ok: true as const };
  });

export const deleteParty = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as { id?: string; kind?: string };
    const id = str(row.id, 80);
    if (!id) throw new Error("Relatie ontbreekt.");
    return { id, kind: row.kind === "supplier" ? "supplier" as const : "client" as const };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const userId = context.userId;
    if (data.kind === "client") {
      const used = await sql<{ n: number }>`
        select count(*)::int as n from invoices where user_id = ${userId} and client_id = ${data.id}`;
      if ((used[0]?.n ?? 0) > 0) throw new Error("Deze klant heeft facturen. Zet hem op non-actief.");
      await sql`update documents set client_id = null where client_id = ${data.id} and user_id = ${userId}`;
      await sql`delete from clients where id = ${data.id} and user_id = ${userId}`;
    } else {
      const used = await sql<{ n: number }>`
        select count(*)::int as n from journals where user_id = ${userId} and supplier_id = ${data.id}`;
      if ((used[0]?.n ?? 0) > 0) throw new Error("Deze leverancier heeft boekingen. Zet hem op non-actief.");
      await sql`update documents set supplier_id = null where supplier_id = ${data.id} and user_id = ${userId}`;
      await sql`delete from suppliers where id = ${data.id} and user_id = ${userId}`;
    }
    return { ok: true as const };
  });

function partyInput(input: unknown, who: string) {
  const row = (input ?? {}) as Record<string, unknown>;
  const name = str(row.name, 160);
  if (!name) throw new Error(`De ${who} heeft een naam nodig.`);
  const payDays = Math.round(Number(row.payDays));
  return {
    id: str(row.id, 80),
    name,
    vatNumber: str(row.vatNumber, 32).toUpperCase(),
    email: str(row.email, 160),
    phone: str(row.phone, 40),
    contact: str(row.contact, 80),
    address: str(row.address, 180),
    postalCode: str(row.postalCode, 12),
    city: str(row.city, 80),
    country: str(row.country, 80) || "België",
    payDays: Number.isFinite(payDays) ? Math.min(180, Math.max(0, payDays)) : 30,
    iban: str(row.iban, 40).replace(/\s+/g, "").toUpperCase(),
    note: str(row.note, 800),
    active: row.active == null ? true : Boolean(row.active),
    peppolId: str(row.peppolId, 60).replace(/\s+/g, ""),
  };
}

