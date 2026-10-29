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

type EntryInput =
  | { kind: "expense"; date: string; memo: string; account: string; amountEx: number; vatRate: number; paid: boolean; supplierId: string }
  | { kind: "prepay"; date: string; amount: number }
  | { kind: "salary"; date: string; memo: string; amount: number }
  | { kind: "capital"; date: string; amount: number }
  | { kind: "asset"; date: string; memo: string; account: string; amountEx: number; vatRate: number; paid: boolean };

export const postEntry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown): EntryInput => {
    const row = (input ?? {}) as Record<string, unknown>;
    const kind = str(row.kind, 20);
    const date = dateStr(row.date);
    if (kind === "expense" || kind === "asset") {
      const account = kind === "asset" ? "2400" : str(row.account, 8);
      if (!isKnownAccount(account) || (kind === "expense" && !account.startsWith("6"))) {
        throw new Error("Kies een kostenrekening.");
      }
      const amountEx = num(row.amountEx);
      if (amountEx <= 0) throw new Error("Bedrag moet groter zijn dan nul.");
      const vatRate = [0, 6, 12, 21].includes(Number(row.vatRate)) ? Number(row.vatRate) : 21;
      const memo = str(row.memo, 180) || accountName(account);
      if (kind === "expense") {
        return { kind: "expense", date, memo, account, amountEx, vatRate, paid: row.paid !== false, supplierId: str(row.supplierId, 80) };
      }
      return { kind: "asset", date, memo, account, amountEx, vatRate, paid: true };
    }
    if (kind === "prepay" || kind === "capital") {
      const amount = num(row.amount);
      if (amount <= 0) throw new Error("Bedrag moet groter zijn dan nul.");
      return { kind, date, amount };
    }
    if (kind === "salary") {
      const amount = num(row.amount);
      if (amount <= 0) throw new Error("Bedrag moet groter zijn dan nul.");
      return { kind: "salary", date, memo: str(row.memo, 180) || "Bezoldiging", amount };
    }
    throw new Error("Onbekend boekstuk.");
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const userId = context.userId;
    if (data.kind === "expense" || data.kind === "asset") {
      const companies = await sql<Record<string, unknown>>`select vat_regime from companies where user_id = ${userId}`;
      const exempt = str(companies[0]?.vat_regime, 20) === "exempt";
      const rate = exempt ? 0 : data.vatRate;
      const vat = round2((data.amountEx * rate) / 100);
      const incl = round2(data.amountEx + vat);
      const creditAccount = data.kind === "expense" && !data.paid ? "4400" : "5500";
      let supplierId: string | null = null;
      if (data.kind === "expense" && data.supplierId) {
        const known = await sql<{ id: string }>`select id from suppliers where id = ${data.supplierId} and user_id = ${userId}`;
        if (!known[0]) throw new Error("Leverancier niet gevonden.");
        supplierId = data.supplierId;
      }
      await insertJournal(sql, userId, data.date, data.memo, "manual", "", false, [
        { account: data.account, label: accountName(data.account), debit: data.amountEx, credit: 0 },
        ...(vat > 0 ? [{ account: "4110", label: "Btw aftrek", debit: vat, credit: 0 }] : []),
        { account: creditAccount, label: creditAccount === "5500" ? "Bank" : "Leverancier", debit: 0, credit: incl },
      ], supplierId);
      return { ok: true as const };
    }
    if (data.kind === "prepay") {
      await insertJournal(sql, userId, data.date, "Voorafbetaling vennootschapsbelasting", "manual", "", false, [
        { account: "4120", label: "Voorafbetaling", debit: data.amount, credit: 0 },
        { account: "5500", label: "Bank", debit: 0, credit: data.amount },
      ]);
      return { ok: true as const };
    }
    if (data.kind === "salary") {
      await insertJournal(sql, userId, data.date, data.memo, "manual", "", false, [
        { account: "6200", label: "Bezoldiging", debit: data.amount, credit: 0 },
        { account: "5500", label: "Bank", debit: 0, credit: data.amount },
      ]);
      return { ok: true as const };
    }
    await insertJournal(sql, userId, data.date, "Inbreng op de zaakrekening", "manual", "", false, [
      { account: "5500", label: "Bank", debit: data.amount, credit: 0 },
      { account: "1000", label: "Inbreng", debit: 0, credit: data.amount },
    ]);
    return { ok: true as const };
  });

export const deleteJournal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => str((input as { id?: string })?.id, 80))
  .handler(async ({ context, data: id }) => {
    const sql = await db();
    const rows = await sql<{ source: string }>`select source from journals where id = ${id} and user_id = ${context.userId}`;
    if (!rows[0]) return { ok: false as const, error: "Boeking niet gevonden." };
    if (rows[0].source === "invoice") return { ok: false as const, error: "Factuurboekingen verwijder je niet apart." };
    await sql`delete from journal_lines where journal_id = ${id} and user_id = ${context.userId}`;
    await sql`delete from journals where id = ${id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

