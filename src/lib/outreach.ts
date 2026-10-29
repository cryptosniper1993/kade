/**
 * Prospectie, goedkeuringswachtrij, bot-scopes en verzendregels (implementatiedossier §4, §6, §8, §11).
 * Puur en zonder database, zodat alles met `node --test` te toetsen is.
 * Bedrijfsspecifieke waarden (verboden namen, klantnamen) staan NIET in deze code: die komen uit de database.
 */

export type ProspectStatus =
  | "nieuw" | "concept" | "wacht_goedkeuring" | "verzonden" | "opvolging_concept" | "opgevolgd"
  | "antwoord_positief" | "antwoord_negatief" | "afgemeld" | "bounce" | "overgeslagen" | "klant";
export const PROSPECT_STATUSES: ProspectStatus[] = [
  "nieuw", "concept", "wacht_goedkeuring", "verzonden", "opvolging_concept", "opgevolgd",
  "antwoord_positief", "antwoord_negatief", "afgemeld", "bounce", "overgeslagen", "klant",
];
/** Statussen waarbij een prospect nooit meer gemaild mag worden. */
export const NO_CONTACT: ProspectStatus[] = ["afgemeld", "bounce", "overgeslagen", "klant", "antwoord_negatief"];

export type ProjectPhase =
  | "lead" | "kennismaking_gepland" | "analyse" | "offerte_concept" | "offerte_verzonden"
  | "getekend" | "in_uitvoering" | "live" | "onderhoud";
export const PROJECT_PHASES: ProjectPhase[] = [
  "lead", "kennismaking_gepland", "analyse", "offerte_concept", "offerte_verzonden",
  "getekend", "in_uitvoering", "live", "onderhoud",
];

export type ApprovalKind = "mail" | "opvolgmail" | "offerte" | "factuur" | "post";
export const APPROVAL_KINDS: ApprovalKind[] = ["mail", "opvolgmail", "offerte", "factuur", "post"];
export type ApprovalStatus = "wacht_goedkeuring" | "goedgekeurd" | "gewijzigd" | "geweigerd" | "verzonden";
export const APPROVAL_STATUSES: ApprovalStatus[] = ["wacht_goedkeuring", "goedgekeurd", "gewijzigd", "geweigerd", "verzonden"];

export type Prospect = {
  id: string;
  nr: number;
  bedrijf: string;
  branche: string;
  gemeente: string;
  afstand: string;
  website: string;
  email: string;
  telefoon: string;
  bron: string;
  haakje: string;
  prioriteit: "A" | "B" | "C" | "";
  opmerking: string;
  status: ProspectStatus;
  statusNote: string;
  sentOn: string | null;
  batch: number | null;
  lastContactOn: string | null;
};

export type ProspectRow = Omit<Prospect, "id" | "batch" | "lastContactOn" | "statusNote"> & { statusNote: string };

/* ---------- CSV ---------- */

/** Splitst één CSV-regel met scheidingsteken `;` (of `,`), met aanhalingstekens. */
export function splitCsvLine(line: string, sep = ";"): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** "verzonden 27/10" -> { status: verzonden, sentOn: 2026-10-27 } (jaar uit `year`). */
export function parseCsvStatus(raw: string, year: number): { status: ProspectStatus; sentOn: string | null; note: string } {
  const s = raw.trim().toLowerCase();
  if (!s) return { status: "nieuw", sentOn: null, note: "" };
  const m = s.match(/verzonden\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : year;
    return { status: "verzonden", sentOn: `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`, note: "" };
  }
  const direct = PROSPECT_STATUSES.find((p) => s === p || s.replace(/\s+/g, "_") === p);
  if (direct) return { status: direct, sentOn: null, note: "" };
  return { status: "nieuw", sentOn: null, note: raw.trim() };
}

/** Leest prospects-100.csv (UTF-8 met BOM, `;`). Onbekende kolommen worden genegeerd. */
export function parseProspectsCsv(text: string, year: number): { rows: ProspectRow[]; errors: string[] } {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = clean.split("\n").filter((l) => l.trim());
  const errors: string[] = [];
  if (!lines.length) return { rows: [], errors: ["Leeg bestand."] };
  const sep = lines[0].includes(";") ? ";" : ",";
  const head = splitCsvLine(lines[0], sep).map((h) => h.toLowerCase().replace(/\uFEFF/g, ""));
  const col = (name: string) => head.indexOf(name);
  if (col("nr") < 0 || col("bedrijf") < 0) return { rows: [], errors: ["Kolommen nr en bedrijf zijn verplicht."] };
  const rows: ProspectRow[] = [];
  const seen = new Set<number>();
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], sep);
    const get = (name: string) => (col(name) >= 0 ? cells[col(name)] ?? "" : "");
    const nr = Number(get("nr"));
    if (!Number.isInteger(nr) || nr <= 0) { errors.push(`Regel ${i + 1}: ongeldig nr.`); continue; }
    if (seen.has(nr)) { errors.push(`Regel ${i + 1}: nr ${nr} dubbel.`); continue; }
    seen.add(nr);
    const prio = get("prioriteit").toUpperCase();
    const st = parseCsvStatus(get("status"), year);
    rows.push({
      nr,
      bedrijf: get("bedrijf").slice(0, 160),
      branche: get("branche").slice(0, 80),
      gemeente: get("gemeente").slice(0, 80),
      afstand: get("afstand_indicatie").slice(0, 40),
      website: get("website").slice(0, 200),
      email: get("email").slice(0, 160).toLowerCase(),
      telefoon: get("telefoon").slice(0, 40),
      bron: get("bron").slice(0, 300),
      haakje: get("haakje").slice(0, 400),
      prioriteit: prio === "A" || prio === "B" || prio === "C" ? prio : "",
      opmerking: get("opmerking").slice(0, 600),
      status: st.status,
      statusNote: st.note,
      sentOn: st.sentOn,
    });
  }
  return { rows, errors };
}

/** Batch-JSON (batch1-15.json): lijst met nr, bedrijf, to, sector, subject, body. */
export type BatchMail = { nr: number; bedrijf: string; to: string; subject: string; body: string };
export function parseBatchJson(text: string): BatchMail[] {
  const raw = JSON.parse(text.replace(/^\uFEFF/, "")) as unknown;
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { mails?: unknown })?.mails) ? (raw as { mails: unknown[] }).mails : [];
  return list.map((item) => {
    const r = item as Record<string, unknown>;
    return {
      nr: Number(r.nr) || 0,
      bedrijf: String(r.bedrijf ?? "").slice(0, 160),
      to: String(r.to ?? "").slice(0, 160),
      subject: String(r.subject ?? "").slice(0, 200),
      body: String(r.body ?? "").slice(0, 8000),
    };
  }).filter((m) => m.nr > 0);
}

/* ---------- Uitgaande tekstfilters (§6, §8) ---------- */

export type FilterIssue = { code: "teken" | "naam" | "prijs" | "link" | "afmelding" | "handtekening"; detail: string };

/** Tekens buiten platte ASCII (plus é è ë ê à ç ï ô ü, die gewone Nederlandse spelling zijn). */
const ALLOWED_ACCENTS = "éèëêàâçïîôöüûÉÈËÊÀÇÏÔÜ";
export function nonPlainChars(text: string): string[] {
  const bad = new Set<string>();
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\n" || ch === "\r" || ch === "\t") continue;
    if (code >= 32 && code < 127) continue;
    if (ALLOWED_ACCENTS.includes(ch)) continue;
    bad.add(ch);
  }
  return [...bad];
}

/** Vervangt veelvoorkomende "rare tekens" door platte varianten. */
export function plainify(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00B3/g, "3")
    .replace(/\u00B2/g, "2")
    .replace(/\u00A0/g, " ")
    .replace(/\u20AC/g, "EUR");
}

const PRICE_RE = /(€|\beur\b|\beuro\b|\d+[.,]?\d*\s*(?:€|eur|euro)|\bprijs\b|\btarief\b|\/\s*maand)/i;

export function checkOutbound(
  text: string,
  opts: { forbiddenNames: string[]; cold: boolean; requireUnsubscribe?: boolean },
): FilterIssue[] {
  const issues: FilterIssue[] = [];
  const chars = nonPlainChars(text);
  if (chars.length) issues.push({ code: "teken", detail: `Niet-platte tekens: ${chars.join(" ")}` });
  const lower = text.toLowerCase();
  for (const name of opts.forbiddenNames) {
    const n = name.trim().toLowerCase();
    if (!n) continue;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "iu");
    if (re.test(lower)) issues.push({ code: "naam", detail: `Verboden naam in tekst: "${name.trim()}"` });
  }
  if (opts.cold) {
    if (PRICE_RE.test(text)) issues.push({ code: "prijs", detail: "Geen prijzen in een koude mail." });
    if (/https?:\/\/|www\./i.test(text)) issues.push({ code: "link", detail: "Geen links in de mailtekst (alleen in de handtekening)." });
    if (opts.requireUnsubscribe !== false && !lower.includes("wenst u geen verdere berichten")) {
      issues.push({ code: "afmelding", detail: 'Afmeldregel ontbreekt: "Wenst u geen verdere berichten? Laat het gerust weten."' });
    }
  }
  if (/^\s*(met vriendelijke groet(en)?|mvg)[\s,]*\n[^\n]+\n?[^\n]*@/im.test(text)) {
    issues.push({ code: "handtekening", detail: "Typ geen handtekening: die wordt automatisch toegevoegd." });
  }
  return issues;
}

export const UNSUBSCRIBE_LINE = "Wenst u geen verdere berichten? Laat het gerust weten.";

/* ---------- Verzendvenster en opvolging (§6) ---------- */

export type SendRules = { maxPerDay: number; days: number[]; from: string; until: string };
/** Standaard: max 15 per dag, dinsdag t/m donderdag (2-4), 08:30-11:00 Brussel. */
export const DEFAULT_SEND_RULES: SendRules = { maxPerDay: 15, days: [2, 3, 4], from: "08:30", until: "11:00" };

/** Brusselse weekdag (0 = zondag) en HH:MM van een moment. */
export function brusselsClock(at: Date): { day: string; weekday: number; hm: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { day: `${get("year")}-${get("month")}-${get("day")}`, weekday: wd, hm: `${hour}:${get("minute")}` };
}

/** Waarom er nu niet verzonden mag worden, of null als het mag. */
export function sendBlocker(at: Date, sentToday: number, rules: SendRules = DEFAULT_SEND_RULES): string | null {
  const c = brusselsClock(at);
  if (!rules.days.includes(c.weekday)) return "Prospectiemails gaan alleen uit op dinsdag, woensdag en donderdag.";
  if (c.hm < rules.from || c.hm >= rules.until) return `Prospectiemails gaan alleen uit tussen ${rules.from} en ${rules.until}.`;
  if (sentToday >= rules.maxPerDay) return `Daglimiet van ${rules.maxPerDay} mails is bereikt.`;
  return null;
}

/** Datum na n werkdagen (ma-vr), ISO yyyy-mm-dd. */
export function addWorkdays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

/** Eén opvolgmail na 7 werkdagen, daarna stoppen. */
export function followUpDue(p: Pick<Prospect, "status" | "sentOn">, today: string, workdays = 7): boolean {
  if (p.status !== "verzonden" || !p.sentOn) return false;
  return addWorkdays(p.sentOn, workdays) <= today;
}

/** Prospecten die 12 maanden niet reageerden worden gewist (GDPR). */
export function expired(p: Pick<Prospect, "status" | "lastContactOn" | "sentOn">, today: string, months = 12): boolean {
  if (p.status === "klant" || p.status === "antwoord_positief") return false;
  const last = p.lastContactOn ?? p.sentOn;
  if (!last) return false;
  const d = new Date(`${last}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10) <= today;
}

/** Volgende batch kiezen: eerst A dan B, alleen met e-mail en nog nooit gecontacteerd. */
export function pickBatch(prospects: Prospect[], blocked: Set<string>, size = 15): Prospect[] {
  const rank = { A: 0, B: 1, C: 2, "": 3 } as const;
  return prospects
    .filter((p) => p.status === "nieuw" && p.email && !blocked.has(p.email.toLowerCase()) && p.prioriteit !== "C")
    .sort((a, b) => rank[a.prioriteit] - rank[b.prioriteit] || a.nr - b.nr)
    .slice(0, size);
}

/* ---------- Bot-scopes (§3, §4) ---------- */

export type BotScope = { kind: "sales" } | { kind: "project"; projectId: string };

export function scopeOf(row: { scope: string; project_id?: string | null }): BotScope | null {
  if (row.scope === "sales") return { kind: "sales" };
  if (row.scope === "project" && row.project_id) return { kind: "project", projectId: row.project_id };
  return null;
}

/** Mag deze bot dit project zien? Projectbot: alleen het eigen. Sales (joly jumper): alle projecten. */
export function canSeeProject(scope: BotScope, projectId: string | null): boolean {
  if (scope.kind === "sales") return true;
  return projectId != null && projectId === scope.projectId;
}

export function canSeeProspects(scope: BotScope): boolean {
  return scope.kind === "sales";
}

/** Projectbot: elke projectverwijzing moet de eigen zijn. */
export function assertProjectScope(scope: BotScope, projectId: string | null): void {
  if (scope.kind === "project" && projectId !== scope.projectId) throw new Error("Buiten de scope van deze bot.");
}

/* ---------- Sleutels ---------- */

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newBotKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `kade_bot_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/* ---------- Vrijstellingsdrempel (§9) ---------- */

/** Pro-rata drempel voor een startjaar: drempel × resterende dagen / dagen in het jaar, naar boven op euro. */
export function proRataThreshold(threshold: number, startIso: string | null, year: number): number {
  if (!startIso || Number(startIso.slice(0, 4)) !== year) return threshold;
  const start = Date.UTC(year, Number(startIso.slice(5, 7)) - 1, Number(startIso.slice(8, 10)));
  const end = Date.UTC(year + 1, 0, 1);
  const days = Math.round((end - start) / 86400000);
  const total = Math.round((end - Date.UTC(year, 0, 1)) / 86400000);
  return Math.round((threshold * days) / total);
}

export function thresholdState(revenue: number, limit: number): { pct: number; level: "ok" | "zicht" | "over"; left: number } {
  const pct = limit > 0 ? Math.round((revenue / limit) * 100) : 0;
  return { pct, level: revenue > limit ? "over" : pct >= 80 ? "zicht" : "ok", left: Math.max(0, Math.round((limit - revenue) * 100) / 100) };
}

/**
 * Mag deze context naar een uitgaande bot? Projectbot: alleen ids van het eigen project, en
 * nooit een id van een (vertrouwelijk) ander project. Ids die geen project zijn worden geweigerd
 * tenzij het scherm "projecten" is (taken/offertes binnen het eigen project).
 */
export function contextBlocker(scope: BotScope, ids: string[], projects: { id: string; confidential: boolean }[], view: string): string | null {
  if (scope.kind === "sales") return null;
  const projectIds = new Set(projects.map((p) => p.id));
  for (const id of ids) {
    if (!id || id === scope.projectId) continue;
    if (projectIds.has(id)) return "Een projectbot krijgt geen gegevens van een ander project.";
    if (view !== "projecten") return "Een projectbot krijgt alleen context uit zijn eigen project.";
  }
  return null;
}
