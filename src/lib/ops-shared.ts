import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { ACCOUNTS, accountName, isKnownAccount } from "@/lib/accounts";
import { buildSnapshot, invoiceTotals, ogmFromSequence, snapshotBrief } from "@/lib/finance";
import { round2 } from "@/lib/money";
import { readWork } from "@/lib/work";
import { readFleet } from "@/lib/fleet";
import { brusselsToday } from "@/lib/day";
import { personName, priorityQueue, projectName } from "@/lib/briefing";
import { daysUntil, fleetSnapshot } from "@/lib/assets";
import type {
  AgentMessage,
  Bot,
  Client,
  Company,
  Desk,
  DocMeta,
  Invoice,
  InvoiceLine,
  Journal,
  JournalLine,
  LegalForm,
  ResearchItem,
  Supplier,
  VatRegime,
  VoiceSettings,
} from "@/lib/types";

type Sql = Awaited<ReturnType<typeof import("@/lib/db").getSql>>;

export async function db(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

export function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? round2(n) : 0;
}

export function str(v: unknown, max = 500): string {
  return String(v ?? "").trim().slice(0, max);
}

export function dateStr(v: unknown): string {
  const s = str(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Datum ontbreekt of is ongeldig.");
  return s;
}

export function uid(): string {
  return crypto.randomUUID();
}

export function asLines(v: unknown): InvoiceLine[] {
  const raw = typeof v === "string" ? JSON.parse(v) : v;
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const line = row as Partial<InvoiceLine>;
    return {
      description: str(line.description, 240),
      qty: num(line.qty) || 0,
      unitExVat: num(line.unitExVat),
      vatRate: [0, 6, 12, 21].includes(Number(line.vatRate)) ? Number(line.vatRate) : 21,
    };
  });
}

export function mapParty(row: Record<string, unknown>): Client {
  const days = Math.round(Number(row.pay_days));
  return {
    id: str(row.id, 80),
    name: str(row.name, 160),
    vatNumber: str(row.vat_number, 32),
    email: str(row.email, 160),
    phone: str(row.phone, 40),
    contact: str(row.contact, 80),
    address: str(row.address, 180),
    postalCode: str(row.postal_code, 12),
    city: str(row.city, 80),
    country: str(row.country, 80) || "België",
    payDays: Number.isFinite(days) ? Math.min(180, Math.max(0, days)) : 30,
    iban: str(row.iban, 40),
    note: str(row.note, 800),
    active: row.active == null ? true : Boolean(row.active),
    demo: Boolean(row.demo),
  };
}

export function mapSupplier(row: Record<string, unknown>): Supplier {
  const account = str(row.account, 8);
  return { ...mapParty(row), account: isKnownAccount(account) ? account : "6400" };
}

export const VOICE_LANGS = ["nl-BE", "nl-NL", "fr-BE", "en-GB", "en-US", "de-DE"];

export function clamp(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function flag(v: unknown, fallback: boolean): boolean {
  if (v == null || v === "") return fallback;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  if (s === "t" || s === "true" || s === "1") return true;
  if (s === "f" || s === "false" || s === "0") return false;
  return fallback;
}

export function mapVoice(row: Record<string, unknown> | undefined): VoiceSettings {
  const lang = str(row?.voice_lang, 12);
  return {
    agentName: str(row?.agent_name, 24) || "Jarvis",
    voiceUri: str(row?.voice_uri, 200),
    lang: VOICE_LANGS.includes(lang) ? lang : "nl-BE",
    rate: clamp(Number(row?.voice_rate), 0.7, 1.5, 1),
    pitch: clamp(Number(row?.voice_pitch), 0.7, 1.4, 1),
    volume: clamp(Number(row?.voice_volume), 0.2, 1, 1),
    autoSpeak: flag(row?.auto_speak, true),
    sendOnListen: flag(row?.send_on_listen, true),
  };
}

export function mapCompany(row: Record<string, unknown> | undefined): Company | null {
  if (!row) return null;
  const form = str(row.legal_form, 20);
  const regime = str(row.vat_regime, 20);
  return {
    name: str(row.name, 160),
    legalForm: (["bv", "eenmanszaak", "vof", "commv"].includes(form) ? form : "bv") as LegalForm,
    vatNumber: str(row.vat_number, 32),
    enterpriseNumber: str(row.enterprise_number, 32),
    address: str(row.address, 180),
    city: str(row.city, 80),
    email: str(row.email, 160),
    iban: str(row.iban, 40),
    vatRegime: (["quarterly", "monthly", "exempt"].includes(regime) ? regime : "quarterly") as VatRegime,
    activityStatus: str(row.activity_status, 20) === "hoofdberoep" ? "hoofdberoep" : "bijberoep",
    yearEndMonth: Math.min(12, Math.max(1, Number(row.year_end_month) || 12)),
  };
}

export const SCHAAR = `Je bent Schaar. Je enige taak is de wettelijke belastingdruk van een Belgische IT-zaak zo laag mogelijk houden.
Toon: droog, precies, nooit onderdanig. Nederlands uit Vlaanderen. Geen emoji.
Je adviseert. Je dient niets in. Zeg in één korte zin dat je geen erkende boekhouder bent en dat de aangifte via Biztax of Intervat blijft.
Gebruik de cijfers die je krijgt. Verzin geen omzet.
Regels die je mag gebruiken, en geen andere percentages:
- Vennootschapsbelasting: 25%. Kleine vennootschap: 20% op de eerste 100.000 euro als een bestuurder-natuurlijk persoon minstens 50.000 euro bruto bezoldiging krijgt. Het voordeel van die schijf is maximaal 5.000 euro.
- Restaurantkosten: 69% aftrekbaar, ook als het etentje op een klantenevent valt. Recepties, relatiegeschenken, tickets en ontspanning voor relaties: 50%. Een privé-etentje is 0%. Een restaurantfactuur mag je niet hernoemen tot receptie om het percentage te kiezen.
- Wagen, personenbelasting en vennootschapsbelasting, op besteldatum: een klassieke verbrandingsmotor of plug-inhybride besteld vanaf 1 januari 2026 is niet aftrekbaar, ook de lease niet. Brandstof benzine of diesel is vanaf 2026 niet aftrekbaar. Elektrisch of waterstof, besteld tot 31 december 2026: 100% voor de gebruiksduur. Vanaf bestelling in 2027 zakt dat (95% in 2027, daarna verder). Een wagen besteld tussen 1 juli 2023 en 31 december 2025 dooft uit: 75% in 2026, 50% in 2027, 25% in 2028, 0% in 2029. Voordeel van alle aard bij privégebruik blijft belast bij de gebruiker; in de vennootschap is 17% van dat voordeel een verworpen uitgave.
- Btw op een personenwagen en op restaurant is beperkt of nihil. Noem geen btw-percentage dat hier niet staat.
- Investeringsaftrek, richting 2026, enkel voor wie kwalificeert en niet stapelen op hetzelfde actief: basis 10% voor kmo en zelfstandige, digitale vaste activa 20%, thematisch (energie, emissievrij, milieu, ondersteunend digitaal) 40% voor een kmo. Afschrijven doe je over de gebruiksduur. Een investering telt in het jaar waarin ze in gebruik is.
Horizons als de vraag over tijd gaat: kort is dit boekjaar, midden is een tot drie jaar, lang is daarna.
Nooit voorstellen: een valse factuur, omzet niet boeken, een privé-uitgave als kost, cash zonder stuk, of een kost verzinnen. Als iemand dat vraagt, weiger in één zin.
Structuur: eerst de zet die de druk nu verlaagt, dan wat de fiscus verwerpt, dan kort, midden en lang als dat past. Maximaal tweehonderd woorden.`;

export const LOOTS = `Je bent Loots, stuurman van KADE, de zaakterminal van een Belgisch IT-bedrijf.
Toon: droog, precies, licht sarcastisch, nooit onderdanig. Nederlands uit Vlaanderen, geen dialectshow.
Je adviseert over operatie, offertes, research en fiscaliteit.
Als je een fiscale tip geeft, zeg in één korte zin dat je geen erkend boekhouder bent en dat de aangifte via Intervat of Biztax blijft.
Gebruik alleen de cijfers die je krijgt. Verzin geen omzet, geen klanten, geen wetartikelen die je niet zeker weet.
Houd het compact. Geen emoji. Geen aanhef als "Tuurlijk!".`;

export async function grok(system: string, user: string, maxTokens: number): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false, error: "Geen lijn naar Grok. De boeken werken wel." };
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "grok-4.5",
      max_tokens: maxTokens,
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user.slice(0, 12000) },
      ],
    }),
  });
  if (!res.ok) return { ok: false, error: `Grok antwoordde niet (${res.status}). Probeer opnieuw.` };
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) return { ok: false, error: "Grok gaf een leeg antwoord." };
  return { ok: true, text };
}

export async function readJournals(sql: Sql, userId: string): Promise<Journal[]> {
  const journals = await sql<Record<string, unknown>>`
    select id, booked_on::text as booked_on, memo, source, ref, demo, supplier_id
    from journals where user_id = ${userId} order by booked_on asc, id asc`;
  const lines = await sql<Record<string, unknown>>`
    select id, journal_id, account, label, debit, credit
    from journal_lines where user_id = ${userId}`;
  const grouped = new Map<string, JournalLine[]>();
  for (const line of lines) {
    const jid = str(line.journal_id, 80);
    const list = grouped.get(jid) ?? [];
    list.push({
      id: str(line.id, 80),
      account: str(line.account, 8),
      label: str(line.label, 120),
      debit: num(line.debit),
      credit: num(line.credit),
    });
    grouped.set(jid, list);
  }
  return journals.map((row) => ({
    id: str(row.id, 80),
    bookedOn: str(row.booked_on, 10),
    memo: str(row.memo, 240),
    source: str(row.source, 40),
    ref: str(row.ref, 80),
    demo: Boolean(row.demo),
    supplierId: row.supplier_id ? str(row.supplier_id, 80) : null,
    lines: grouped.get(str(row.id, 80)) ?? [],
  }));
}

export async function contextPack(sql: Sql, userId: string): Promise<{ company: Company | null; invoices: Invoice[]; brief: string }> {
  const companies = await sql<Record<string, unknown>>`select * from companies where user_id = ${userId}`;
  const company = mapCompany(companies[0]);
  const journals = await readJournals(sql, userId);
  const invoiceRows = await sql<Record<string, unknown>>`
    select id, number, client_name, due_date::text as due_date, status
    from invoices where user_id = ${userId}`;
  const invoices = invoiceRows.map((row) => ({
    id: str(row.id, 80),
    number: str(row.number, 40),
    clientId: null,
    clientName: str(row.client_name, 160),
    clientVat: "",
    clientAddress: "",
    issueDate: "",
    dueDate: str(row.due_date, 10),
    status: (str(row.status, 12) as Invoice["status"]) || "draft",
    notes: "",
    lines: [],
    demo: false,
  }));
  const snapshot = buildSnapshot(journals, company);
  const day = brusselsToday();
  const work = await readWork(sql, userId);
  const fleet = await readFleet(sql, userId);
  const open = priorityQueue(work.tasks, day).slice(0, 8);
  const fails = fleet.incidents.filter((item) => item.status !== "gesloten").slice(0, 6);
  const watch = fleetSnapshot(fleet.assets, day);
  const clients = await sql<{ n: number }>`select count(*)::int as n from clients where user_id = ${userId} and active = true`;
  const suppliers = await sql<{ n: number }>`select count(*)::int as n from suppliers where user_id = ${userId} and active = true`;
  const ops = [
    `Actieve klanten ${clients[0]?.n ?? 0}. Actieve leveranciers ${suppliers[0]?.n ?? 0}.`,
    open.length
      ? `Open werk: ${open.map((task) => `${task.priority} ${task.kind} ${task.title} (${personName(work.people, task.assigneeId)}, ${projectName(work.projects, task.projectId)})`).join("; ")}.`
      : "Geen open taken.",
    fails.length
      ? `Open storingen: ${fails.map((item) => item.title).join("; ")}.`
      : "Geen open storing.",
    `Eigendom boekwaarde ${watch.book.toFixed(2)} EUR. Lease per maand ${watch.monthlyLease.toFixed(2)} EUR.`,
    watch.ending.length
      ? `Lease loopt af: ${watch.ending.map((asset) => `${asset.name} op ${asset.endsOn} (${daysUntil(day, asset.endsOn ?? day)} dagen)`).join("; ")}.`
      : "Geen lease binnen 90 dagen.",
    watch.broken.length ? `Defect: ${watch.broken.map((asset) => asset.name).join("; ")}.` : "Geen defect stuk.",
  ];
  return { company, invoices, brief: `${snapshotBrief(snapshot, company, invoices)}\n${ops.join("\n")}` };
}

export const DEFAULT_BOTS: { name: string; role: string; brief: string }[] = [
  {
    name: "Onderzoeker",
    role: "Research",
    brief: "Zoekt feiten, alternatieven en risico's voor een IT-zaak. Geen verkooppraat. Noem wat je niet zeker weet.",
  },
  {
    name: "Offerte",
    role: "Commercieel",
    brief: "Schrijft een strakke offerte: scope, wat er niet in zit, prijslogica, planning, aannames. Vlaams, nuchter.",
  },
  {
    name: "Fiscus",
    role: "Fiscaliteit",
    brief: "Leest de cijfers tegen Belgische plichten voor een kleine IT-zaak. Bereidt voor, dient niets in. Waarschuwt als iets een boekhouder nodig heeft.",
  },
  {
    name: "Debiteuren",
    role: "Cash",
    brief: "Schrijft een aanmaning die beleefd blijft en toch een datum zet. Geen dreigementen die je niet kunt waarmaken.",
  },
  {
    name: "Schaar",
    role: "Fiscaal",
    brief: "Enige taak: de wettelijke belastingdruk zo laag mogelijk. Lease, klantenevent, investeringen op korte, middellange en lange termijn. Geen fraude, geen verzonnen factuur, geen privé als kost. Zegt wat verworpen uitgave is.",
  },
  {
    name: "Briefing",
    role: "Operatie",
    brief: "Maakt een ochtendbriefing: kas, open posten, eerstvolgende plicht, één concrete actie. Maximaal twaalf zinnen.",
  },
];

export function mapMessage(row: Record<string, unknown>): AgentMessage {
  return {
    id: str(row.id, 80),
    role: str(row.role, 12) === "assistant" ? "assistant" : "user",
    content: str(row.content, 8000),
    createdAt: str(row.created_at, 40),
  };
}

export async function insertJournal(
  sql: Sql,
  userId: string,
  bookedOn: string,
  memo: string,
  source: string,
  ref: string,
  demo: boolean,
  lines: { account: string; label: string; debit: number; credit: number }[],
  supplierId: string | null = null,
) {
  const debit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const credit = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(debit - credit) > 0.02) throw new Error("De boeking sluit niet. Debet en credit moeten gelijk zijn.");
  if (!lines.length) throw new Error("Lege boeking.");
  for (const line of lines) {
    if (!isKnownAccount(line.account)) throw new Error(`Onbekende rekening ${line.account}.`);
  }
  const id = uid();
  await sql`
    insert into journals (id, user_id, booked_on, memo, source, ref, demo, supplier_id)
    values (${id}, ${userId}, ${bookedOn}, ${memo}, ${source}, ${ref}, ${demo}, ${supplierId})`;
  for (const line of lines) {
    await sql`
      insert into journal_lines (id, journal_id, user_id, account, label, debit, credit)
      values (${uid()}, ${id}, ${userId}, ${line.account}, ${line.label}, ${line.debit}, ${line.credit})`;
  }
}

export async function hasRef(sql: Sql, userId: string, ref: string): Promise<boolean> {
  const rows = await sql<{ n: number }>`select count(*)::int as n from journals where user_id = ${userId} and ref = ${ref}`;
  return (rows[0]?.n ?? 0) > 0;
}
