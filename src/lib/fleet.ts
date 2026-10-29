import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { accountName } from "@/lib/accounts";
import { assetAccount, depreciation } from "@/lib/assets";
import { brusselsToday } from "@/lib/day";
import { round2 } from "@/lib/money";
import type { Asset, AssetCategory, AssetKind, AssetStatus, Incident, IncidentStatus } from "@/lib/types";

type Sql = Awaited<ReturnType<typeof import("@/lib/db").getSql>>;

async function db(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

function str(v: unknown, max = 500): string {
  return String(v ?? "").trim().slice(0, max);
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? round2(n) : 0;
}

function uid(): string {
  return crypto.randomUUID();
}

function optDate(v: unknown): string | null {
  const s = str(v, 10);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Datum is ongeldig.");
  return s;
}

function asKind(v: unknown): AssetKind {
  return str(v, 12) === "lease" ? "lease" : "eigendom";
}

function asCategory(v: unknown): AssetCategory {
  const s = str(v, 20);
  if (s === "wagen" || s === "software" || s === "kantoor" || s === "overig") return s;
  return "hardware";
}

function asStatus(v: unknown): AssetStatus {
  const s = str(v, 12);
  if (s === "reserve" || s === "defect" || s === "einde") return s;
  return "gebruik";
}

function asIncidentStatus(v: unknown): IncidentStatus {
  const s = str(v, 12);
  if (s === "opvolging" || s === "gesloten") return s;
  return "open";
}

function plusDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mapAsset(row: Record<string, unknown>): Asset {
  return {
    id: str(row.id, 80),
    name: str(row.name, 140),
    kind: asKind(row.kind),
    category: asCategory(row.category),
    ref: str(row.ref, 80),
    vendor: str(row.vendor, 140),
    acquiredOn: row.acquired_on ? str(row.acquired_on, 10) : null,
    endsOn: row.ends_on ? str(row.ends_on, 10) : null,
    amountEur: num(row.amount_eur),
    residualEur: num(row.residual_eur),
    lifeMonths: Math.max(1, Math.min(240, Number(row.life_months) || 36)),
    status: asStatus(row.status),
    holderId: row.holder_id ? str(row.holder_id, 80) : null,
    projectId: row.project_id ? str(row.project_id, 80) : null,
    note: str(row.note, 800),
  };
}

function mapIncident(row: Record<string, unknown>): Incident {
  return {
    id: str(row.id, 80),
    assetId: row.asset_id ? str(row.asset_id, 80) : null,
    projectId: row.project_id ? str(row.project_id, 80) : null,
    taskId: row.task_id ? str(row.task_id, 80) : null,
    title: str(row.title, 180),
    detail: str(row.detail, 800),
    severity: str(row.severity, 12) === "normaal" ? "normaal" : "hoog",
    status: asIncidentStatus(row.status),
    happenedOn: row.happened_on ? str(row.happened_on, 10) : null,
    createdAt: str(row.created_at, 40),
  };
}

export async function readFleet(sql: Sql, userId: string): Promise<{ assets: Asset[]; incidents: Incident[] }> {
  const assets = await sql<Record<string, unknown>>`
    select id, name, kind, category, ref, vendor, acquired_on::text as acquired_on, ends_on::text as ends_on,
           amount_eur, residual_eur, life_months, status, holder_id, project_id, note
    from assets where user_id = ${userId} order by name asc`;
  const incidents = await sql<Record<string, unknown>>`
    select id, asset_id, project_id, task_id, title, detail, severity, status,
           happened_on::text as happened_on, created_at::text as created_at
    from incidents where user_id = ${userId} order by created_at desc`;
  const order = (s: AssetStatus) => (s === "defect" ? 0 : s === "gebruik" ? 1 : s === "reserve" ? 2 : 3);
  return {
    assets: assets.map(mapAsset).sort((a, b) => order(a.status) - order(b.status) || a.name.localeCompare(b.name, "nl")),
    incidents: incidents.map(mapIncident),
  };
}

async function owns(sql: Sql, table: "projects" | "people" | "assets", id: string, userId: string): Promise<boolean> {
  if (!id) return false;
  const rows = table === "projects"
    ? await sql<{ id: string }>`select id from projects where id = ${id} and user_id = ${userId}`
    : table === "people"
      ? await sql<{ id: string }>`select id from people where id = ${id} and user_id = ${userId}`
      : await sql<{ id: string }>`select id from assets where id = ${id} and user_id = ${userId}`;
  return Boolean(rows[0]);
}

type AssetInput = {
  id: string;
  name: string;
  kind: AssetKind;
  category: AssetCategory;
  ref: string;
  vendor: string;
  acquiredOn: string | null;
  endsOn: string | null;
  amountEur: number;
  residualEur: number;
  lifeMonths: number;
  status: AssetStatus;
  holderId: string;
  projectId: string;
  note: string;
};

export const saveAsset = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown): AssetInput => {
    const row = (input ?? {}) as Record<string, unknown>;
    const name = str(row.name, 140);
    if (!name) throw new Error("Een stuk heeft een naam nodig.");
    const kind = asKind(row.kind);
    const amountEur = num(row.amountEur);
    if (amountEur < 0) throw new Error("Een bedrag is niet negatief.");
    const residualEur = kind === "lease" ? 0 : num(row.residualEur);
    if (residualEur < 0 || residualEur > amountEur) throw new Error("De restwaarde zit tussen nul en de aanschaf.");
    const life = kind === "lease" ? 1 : Math.max(1, Math.min(240, Math.round(Number(row.lifeMonths) || 36)));
    return {
      id: str(row.id, 80),
      name,
      kind,
      category: asCategory(row.category),
      ref: str(row.ref, 80),
      vendor: str(row.vendor, 140),
      acquiredOn: optDate(row.acquiredOn),
      endsOn: optDate(row.endsOn),
      amountEur,
      residualEur,
      lifeMonths: life,
      status: asStatus(row.status),
      holderId: str(row.holderId, 80),
      projectId: str(row.projectId, 80),
      note: str(row.note, 800),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const userId = context.userId;
    if (data.holderId && !(await owns(sql, "people", data.holderId, userId))) throw new Error("Die persoon staat niet op de kade.");
    if (data.projectId && !(await owns(sql, "projects", data.projectId, userId))) throw new Error("Project niet gevonden.");
    const holder = data.holderId || null;
    const project = data.projectId || null;
    if (data.id) {
      const rows = await sql<{ id: string }>`select id from assets where id = ${data.id} and user_id = ${userId}`;
      if (!rows[0]) throw new Error("Stuk niet gevonden.");
      await sql`
        update assets set name = ${data.name}, kind = ${data.kind}, category = ${data.category}, ref = ${data.ref},
          vendor = ${data.vendor}, acquired_on = ${data.acquiredOn}, ends_on = ${data.endsOn},
          amount_eur = ${data.amountEur}, residual_eur = ${data.residualEur}, life_months = ${data.lifeMonths},
          status = ${data.status}, holder_id = ${holder}, project_id = ${project}, note = ${data.note}
        where id = ${data.id} and user_id = ${userId}`;
      return { id: data.id };
    }
    const id = uid();
    await sql`
      insert into assets (
        id, user_id, name, kind, category, ref, vendor, acquired_on, ends_on,
        amount_eur, residual_eur, life_months, status, holder_id, project_id, note
      ) values (
        ${id}, ${userId}, ${data.name}, ${data.kind}, ${data.category}, ${data.ref}, ${data.vendor},
        ${data.acquiredOn}, ${data.endsOn}, ${data.amountEur}, ${data.residualEur}, ${data.lifeMonths},
        ${data.status}, ${holder}, ${project}, ${data.note}
      )`;
    return { id };
  });

export const deleteAsset = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = str((input as { id?: string })?.id, 80);
    if (!id) throw new Error("Stuk ontbreekt.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const open = await sql<{ n: number }>`
      select count(*)::int as n from incidents
      where user_id = ${context.userId} and asset_id = ${data.id} and status <> 'gesloten'`;
    if ((open[0]?.n ?? 0) > 0) throw new Error("Sluit eerst de open storing op dit stuk.");
    await sql`update incidents set asset_id = null where asset_id = ${data.id} and user_id = ${context.userId}`;
    await sql`delete from assets where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

async function insertJournal(
  sql: Sql,
  userId: string,
  bookedOn: string,
  memo: string,
  ref: string,
  lines: { account: string; label: string; debit: number; credit: number }[],
) {
  const id = uid();
  await sql`
    insert into journals (id, user_id, booked_on, memo, source, ref, demo)
    values (${id}, ${userId}, ${bookedOn}, ${memo}, 'asset', ${ref}, false)`;
  for (const line of lines) {
    await sql`
      insert into journal_lines (id, journal_id, user_id, account, label, debit, credit)
      values (${uid()}, ${id}, ${userId}, ${line.account}, ${line.label}, ${line.debit}, ${line.credit})`;
  }
}

async function hasRef(sql: Sql, userId: string, ref: string): Promise<boolean> {
  const rows = await sql<{ n: number }>`select count(*)::int as n from journals where user_id = ${userId} and ref = ${ref}`;
  return (rows[0]?.n ?? 0) > 0;
}

export const bookAssetPurchase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = str((input as { id?: string })?.id, 80);
    if (!id) throw new Error("Stuk ontbreekt.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const userId = context.userId;
    const rows = await sql<Record<string, unknown>>`
      select id, name, kind, category, acquired_on::text as acquired_on, amount_eur
      from assets where id = ${data.id} and user_id = ${userId}`;
    const row = rows[0];
    if (!row) throw new Error("Stuk niet gevonden.");
    if (asKind(row.kind) !== "eigendom") throw new Error("Een lease staat niet op de balans. Boek de maandfactuur als kost.");
    const amount = num(row.amount_eur);
    if (amount <= 0) throw new Error("Zet eerst de aanschafwaarde.");
    const ref = `asset:${data.id}:buy`;
    if (await hasRef(sql, userId, ref)) return { ok: true as const, already: true };
    const category = asCategory(row.category);
    const account = assetAccount(category);
    const date = row.acquired_on ? str(row.acquired_on, 10) : brusselsToday();
    const companies = await sql<{ vat_regime: string }>`select vat_regime from companies where user_id = ${userId}`;
    const exempt = companies[0]?.vat_regime === "exempt";
    const chargeVat = !exempt && category !== "wagen";
    const vat = chargeVat ? round2(amount * 0.21) : 0;
    const name = str(row.name, 80);
    await insertJournal(sql, userId, date, `Aankoop ${name}`, ref, [
      { account, label: accountName(account), debit: amount, credit: 0 },
      ...(vat > 0 ? [{ account: "4110", label: "Btw aftrek", debit: vat, credit: 0 }] : []),
      { account: "5500", label: "Bank", debit: 0, credit: round2(amount + vat) },
    ]);
    return { ok: true as const, already: false, vatSkipped: category === "wagen" && !exempt };
  });

export const bookDepreciation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const userId = context.userId;
    const today = brusselsToday();
    const month = today.slice(0, 7);
    const fleet = await readFleet(sql, userId);
    let booked = 0;
    let skipped = 0;
    for (const asset of fleet.assets) {
      if (asset.kind !== "eigendom" || asset.status === "einde") {
        skipped += 1;
        continue;
      }
      const { monthly, elapsed } = depreciation(asset, today);
      if (monthly <= 0 || elapsed <= 0) {
        skipped += 1;
        continue;
      }
      const buy = `asset:${asset.id}:buy`;
      const ref = `asset:${asset.id}:dep:${month}`;
      if (!(await hasRef(sql, userId, buy))) {
        const stray = await sql<{ id: string }>`select id from journals where user_id = ${userId} and ref = ${ref}`;
        for (const row of stray) {
          await sql`delete from journal_lines where journal_id = ${row.id} and user_id = ${userId}`;
          await sql`delete from journals where id = ${row.id} and user_id = ${userId}`;
        }
        skipped += 1;
        continue;
      }
      if (await hasRef(sql, userId, ref)) {
        skipped += 1;
        continue;
      }
      const account = assetAccount(asset.category);
      await insertJournal(sql, userId, today, `Afschrijving ${asset.name}`, ref, [
        { account: "6300", label: "Afschrijvingen", debit: monthly, credit: 0 },
        { account, label: accountName(account), debit: 0, credit: monthly },
      ]);
      booked += 1;
    }
    return { booked, skipped };
  });

async function ensureFollowUp(
  sql: Sql,
  userId: string,
  incidentId: string,
  title: string,
  detail: string,
  projectId: string | null,
  severity: "hoog" | "normaal",
  happenedOn: string | null,
  existingTaskId: string | null,
  status: IncidentStatus,
): Promise<string | null> {
  const taskStatus = status === "gesloten" ? "klaar" : status === "opvolging" ? "bezig" : "open";
  const doneAt = status === "gesloten" ? new Date().toISOString() : null;
  if (existingTaskId) {
    const rows = await sql<{ id: string }>`select id from tasks where id = ${existingTaskId} and user_id = ${userId}`;
    if (rows[0]) {
      await sql`
        update tasks set title = ${`Opvolging: ${title}`}, detail = ${detail}, cause = ${detail},
          project_id = ${projectId}, priority = ${severity}, status = ${taskStatus}, done_at = ${doneAt}
        where id = ${existingTaskId} and user_id = ${userId}`;
      return existingTaskId;
    }
  }
  if (status === "gesloten") return existingTaskId;
  const day = happenedOn ?? brusselsToday();
  const id = uid();
  await sql`
    insert into tasks (
      id, user_id, project_id, assignee_id, title, detail, kind, cause, priority, status, due_on
    ) values (
      ${id}, ${userId}, ${projectId}, null, ${`Opvolging: ${title}`}, ${detail}, 'cip', ${detail},
      ${severity}, ${taskStatus}, ${plusDays(day, 7)}
    )`;
  await sql`update incidents set task_id = ${id} where id = ${incidentId} and user_id = ${userId}`;
  return id;
}

export const saveIncident = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as Record<string, unknown>;
    const title = str(row.title, 180);
    if (!title) throw new Error("Een storing heeft een naam nodig.");
    return {
      title,
      detail: str(row.detail, 800),
      assetId: str(row.assetId, 80),
      projectId: str(row.projectId, 80),
      severity: str(row.severity, 12) === "normaal" ? "normaal" as const : "hoog" as const,
      happenedOn: optDate(row.happenedOn) ?? brusselsToday(),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const userId = context.userId;
    if (data.assetId && !(await owns(sql, "assets", data.assetId, userId))) throw new Error("Stuk niet gevonden.");
    if (data.projectId && !(await owns(sql, "projects", data.projectId, userId))) throw new Error("Project niet gevonden.");
    const id = uid();
    await sql`
      insert into incidents (id, user_id, asset_id, project_id, title, detail, severity, status, happened_on)
      values (
        ${id}, ${userId}, ${data.assetId || null}, ${data.projectId || null}, ${data.title}, ${data.detail},
        ${data.severity}, 'open', ${data.happenedOn}
      )`;
    if (data.assetId) {
      await sql`update assets set status = 'defect' where id = ${data.assetId} and user_id = ${userId} and status <> 'einde'`;
    }
    await ensureFollowUp(sql, userId, id, data.title, data.detail, data.projectId || null, data.severity, data.happenedOn, null, "open");
    return { id };
  });

export const setIncidentStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as { id?: string; status?: string };
    const id = str(row.id, 80);
    if (!id) throw new Error("Storing ontbreekt.");
    return { id, status: asIncidentStatus(row.status) };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const userId = context.userId;
    const rows = await sql<Record<string, unknown>>`
      select id, asset_id, project_id, task_id, title, detail, severity, happened_on::text as happened_on
      from incidents where id = ${data.id} and user_id = ${userId}`;
    const row = rows[0];
    if (!row) throw new Error("Storing niet gevonden.");
    const closedAt = data.status === "gesloten" ? new Date().toISOString() : null;
    await sql`
      update incidents set status = ${data.status}, closed_at = ${closedAt}
      where id = ${data.id} and user_id = ${userId}`;
    await ensureFollowUp(
      sql,
      userId,
      data.id,
      str(row.title, 180),
      str(row.detail, 800),
      row.project_id ? str(row.project_id, 80) : null,
      str(row.severity, 12) === "normaal" ? "normaal" : "hoog",
      row.happened_on ? str(row.happened_on, 10) : null,
      row.task_id ? str(row.task_id, 80) : null,
      data.status,
    );
    if (data.status === "gesloten" && row.asset_id) {
      const still = await sql<{ n: number }>`
        select count(*)::int as n from incidents
        where user_id = ${userId} and asset_id = ${str(row.asset_id, 80)} and status <> 'gesloten' and id <> ${data.id}`;
      if ((still[0]?.n ?? 0) === 0) {
        await sql`
          update assets set status = 'gebruik'
          where id = ${str(row.asset_id, 80)} and user_id = ${userId} and status = 'defect'`;
      }
    }
    return { ok: true as const };
  });
