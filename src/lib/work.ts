import { callGrok, type GrokResult } from "@/lib/grok-client";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { brusselsToday } from "@/lib/day";
import { personName, priorityQueue, projectName, projectProgress } from "@/lib/briefing";
import { daysUntil, fleetSnapshot } from "@/lib/assets";
import { readFleet } from "@/lib/fleet";
import type {
  BriefingNote,
  Person,
  Project,
  ProjectStatus,
  Task,
  TaskKind,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";

type Sql = Awaited<ReturnType<typeof import("@/lib/db").getSql>>;

async function db(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

function str(v: unknown, max = 500): string {
  return String(v ?? "").trim().slice(0, max);
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

function asPriority(v: unknown): TaskPriority {
  const s = str(v, 12);
  return s === "hoog" || s === "laag" ? s : "normaal";
}

function asKind(v: unknown): TaskKind {
  return str(v, 8) === "cip" ? "cip" : "todo";
}

function asTaskStatus(v: unknown): TaskStatus {
  const s = str(v, 12);
  return s === "bezig" || s === "klaar" ? s : "open";
}

function asProjectStatus(v: unknown): ProjectStatus {
  const s = str(v, 12);
  return s === "pauze" || s === "klaar" ? s : "actief";
}

function mapPerson(row: Record<string, unknown>): Person {
  return {
    id: str(row.id, 80),
    name: str(row.name, 80),
    role: str(row.role, 80),
    active: Boolean(row.active),
  };
}

function mapProject(row: Record<string, unknown>): Project {
  return {
    id: str(row.id, 80),
    name: str(row.name, 140),
    clientName: str(row.client_name, 140),
    status: asProjectStatus(row.status),
    note: str(row.note, 800),
    dueOn: row.due_on ? str(row.due_on, 10) : null,
    createdAt: str(row.created_at, 40),
    botId: str(row.bot_id, 80),
    confidential: Boolean(row.confidential),
    phase: str(row.phase, 30),
    contacts: str(row.contacts, 1000),
    nextAction: str(row.next_action, 400),
  };
}

function mapTask(row: Record<string, unknown>): Task {
  return {
    id: str(row.id, 80),
    projectId: row.project_id ? str(row.project_id, 80) : null,
    assigneeId: row.assignee_id ? str(row.assignee_id, 80) : null,
    title: str(row.title, 180),
    detail: str(row.detail, 800),
    kind: asKind(row.kind),
    cause: str(row.cause, 800),
    priority: asPriority(row.priority),
    status: asTaskStatus(row.status),
    dueOn: row.due_on ? str(row.due_on, 10) : null,
    createdAt: str(row.created_at, 40),
    doneAt: row.done_at ? str(row.done_at, 40) : null,
  };
}

export async function readWork(sql: Sql, userId: string): Promise<{
  people: Person[];
  projects: Project[];
  tasks: Task[];
  briefing: BriefingNote | null;
}> {
  const day = brusselsToday();
  const people = await sql<Record<string, unknown>>`
    select id, name, role, active from people where user_id = ${userId} order by name asc`;
  const projects = await sql<Record<string, unknown>>`
    select id, name, client_name, status, note, due_on::text as due_on, created_at::text as created_at,
           bot_id, confidential, phase, contacts, next_action
    from projects where user_id = ${userId} order by created_at desc`;
  const tasks = await sql<Record<string, unknown>>`
    select id, project_id, assignee_id, title, detail, kind, cause, priority, status,
           due_on::text as due_on, created_at::text as created_at, done_at::text as done_at
    from tasks where user_id = ${userId} order by created_at desc`;
  const notes = await sql<Record<string, unknown>>`
    select day::text as day, body from briefings where user_id = ${userId} and day = ${day}`;
  const note = notes[0];
  return {
    people: people.map(mapPerson),
    projects: projects.map(mapProject).sort((a, b) => {
      const order = (s: ProjectStatus) => (s === "actief" ? 0 : s === "pauze" ? 1 : 2);
      return order(a.status) - order(b.status) || a.name.localeCompare(b.name, "nl");
    }),
    tasks: tasks.map(mapTask),
    briefing: note ? { day: str(note.day, 10), body: str(note.body, 4000) } : null,
  };
}

async function owns(sql: Sql, table: "projects" | "people", id: string, userId: string): Promise<boolean> {
  if (!id) return true;
  const rows = table === "projects"
    ? await sql<{ id: string }>`select id from projects where id = ${id} and user_id = ${userId}`
    : await sql<{ id: string }>`select id from people where id = ${id} and user_id = ${userId}`;
  return Boolean(rows[0]);
}

export const savePerson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as { name?: string; role?: string };
    const name = str(row.name, 80);
    if (!name) throw new Error("Een persoon heeft een naam nodig.");
    return { name, role: str(row.role, 80) };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const id = uid();
    await sql`
      insert into people (id, user_id, name, role, active)
      values (${id}, ${context.userId}, ${data.name}, ${data.role}, true)`;
    return { id };
  });

export const setPersonActive = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as { id?: string; active?: boolean };
    const id = str(row.id, 80);
    if (!id) throw new Error("Persoon ontbreekt.");
    return { id, active: Boolean(row.active) };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    await sql`update people set active = ${data.active} where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const saveProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as Partial<Project>;
    const name = str(row.name, 140);
    if (!name) throw new Error("Een project heeft een naam nodig.");
    return {
      id: str(row.id, 80),
      name,
      clientName: str(row.clientName, 140),
      note: str(row.note, 800),
      dueOn: optDate(row.dueOn),
      status: asProjectStatus(row.status),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const userId = context.userId;
    if (data.id) {
      const rows = await sql<{ id: string }>`select id from projects where id = ${data.id} and user_id = ${userId}`;
      if (!rows[0]) throw new Error("Project niet gevonden.");
      await sql`
        update projects set name = ${data.name}, client_name = ${data.clientName}, note = ${data.note},
          due_on = ${data.dueOn}, status = ${data.status}
        where id = ${data.id} and user_id = ${userId}`;
      return { id: data.id };
    }
    const id = uid();
    await sql`
      insert into projects (id, user_id, name, client_name, status, note, due_on)
      values (${id}, ${userId}, ${data.name}, ${data.clientName}, ${data.status}, ${data.note}, ${data.dueOn})`;
    return { id };
  });

export const setProjectStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as { id?: string; status?: string };
    const id = str(row.id, 80);
    if (!id) throw new Error("Project ontbreekt.");
    return { id, status: asProjectStatus(row.status) };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    await sql`update projects set status = ${data.status} where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

type TaskInput = {
  id: string;
  projectId: string;
  assigneeId: string;
  title: string;
  detail: string;
  kind: TaskKind;
  cause: string;
  priority: TaskPriority;
  dueOn: string | null;
};

export const saveTask = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown): TaskInput => {
    const row = (input ?? {}) as Record<string, unknown>;
    const kind = asKind(row.kind);
    const title = str(row.title, 180);
    if (!title) throw new Error(kind === "cip" ? "Een CIP heeft een maatregel nodig." : "Een taak heeft een titel nodig.");
    return {
      id: str(row.id, 80),
      projectId: str(row.projectId, 80),
      assigneeId: str(row.assigneeId, 80),
      title,
      detail: str(row.detail, 800),
      kind,
      cause: str(row.cause, 800),
      priority: asPriority(row.priority),
      dueOn: optDate(row.dueOn),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const userId = context.userId;
    if (data.projectId && !(await owns(sql, "projects", data.projectId, userId))) throw new Error("Project niet gevonden.");
    if (data.assigneeId && !(await owns(sql, "people", data.assigneeId, userId))) throw new Error("Die persoon staat niet op de kade.");
    const projectId = data.projectId || null;
    const assigneeId = data.assigneeId || null;
    if (data.id) {
      const rows = await sql<{ id: string }>`select id from tasks where id = ${data.id} and user_id = ${userId}`;
      if (!rows[0]) throw new Error("Taak niet gevonden.");
      await sql`
        update tasks set project_id = ${projectId}, assignee_id = ${assigneeId}, title = ${data.title},
          detail = ${data.detail}, kind = ${data.kind}, cause = ${data.cause}, priority = ${data.priority}, due_on = ${data.dueOn}
        where id = ${data.id} and user_id = ${userId}`;
      return { id: data.id };
    }
    const id = uid();
    await sql`
      insert into tasks (
        id, user_id, project_id, assignee_id, title, detail, kind, cause, priority, status, due_on
      ) values (
        ${id}, ${userId}, ${projectId}, ${assigneeId}, ${data.title}, ${data.detail}, ${data.kind},
        ${data.cause}, ${data.priority}, 'open', ${data.dueOn}
      )`;
    return { id };
  });

export const setTaskStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as { id?: string; status?: string };
    const id = str(row.id, 80);
    if (!id) throw new Error("Taak ontbreekt.");
    return { id, status: asTaskStatus(row.status) };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const doneAt = data.status === "klaar" ? new Date().toISOString() : null;
    await sql`
      update tasks set status = ${data.status}, done_at = ${doneAt}
      where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = str((input as { id?: string })?.id, 80);
    if (!id) throw new Error("Taak ontbreekt.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    await sql`delete from tasks where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

async function grok(system: string, user: string): Promise<GrokResult> {
  const r = await callGrok(system, user, { maxTokens: 420, temperature: 0.3, maxInput: 8000, noKey: "Loots heeft nu geen lijn naar Grok. De lijst hierboven klopt wel." });
  return r.ok ? { ok: true, text: r.text.slice(0, 4000) } : r;
}

const BRIEF_SYSTEM = `Je bent Loots, stuurman van KADE. Toon: droog, precies, licht sarcastisch, nooit onderdanig. Nederlands uit Vlaanderen.
Schrijf de ochtendbriefing van vandaag. Gebruik alleen de taken die je krijgt. Verzin geen werk, geen mensen, geen deadlines.
Structuur, zonder koppen met emoji:
- Drie zinnen: wat openstaat en wat eerst moet.
- De prioritaire taken: titel, eigenaar, deadline.
- Open CIP-punten, of één zin dat er geen verbeterpunt openstaat.
- Als er storingen of een aflopende lease in de tekst staan, één zin. Anders niets daarover.
- Eén zin over wat vandaag niet hoeft.
Maximaal 160 woorden. Geen aanhef. Geen emoji.`;

export const writeMorningBrief = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ force: Boolean((input as { force?: boolean })?.force) }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const userId = context.userId;
    const day = brusselsToday();
    if (!data.force) {
      const existing = await sql<Record<string, unknown>>`
        select body from briefings where user_id = ${userId} and day = ${day}`;
      if (existing[0]) return { ok: true as const, day, body: str(existing[0].body, 4000), cached: true as const };
    }
    const work = await readWork(sql, userId);
    const fleet = await readFleet(sql, userId);
    const open = priorityQueue(work.tasks, day);
    const fails = fleet.incidents.filter((item) => item.status !== "gesloten");
    const ending = fleetSnapshot(fleet.assets, day).ending;
    let body: string;
    if (open.length === 0 && fails.length === 0 && ending.length === 0) {
      body = "Geen open taken, geen CIP, geen prio. Geen open storing en geen lease die afloopt. Er is vandaag niets dat om een eigenaar vraagt.";
    } else if (open.length === 0) {
      const failLine = fails.length ? `Open storing: ${fails.map((item) => item.title).join(", ")}.` : "Geen open storing.";
      const leaseLine = ending.length
        ? `Lease loopt af: ${ending.map((asset) => `${asset.name} (${asset.endsOn ? daysUntil(day, asset.endsOn) : 0} dagen)`).join(", ")}.`
        : "Geen lease binnen 90 dagen.";
      body = `Geen open taken. ${failLine} ${leaseLine}`;
    } else {
      const lines = open.slice(0, 40).map((task) => {
        const who = personName(work.people, task.assigneeId);
        const where = projectName(work.projects, task.projectId);
        const due = task.dueOn ?? "geen deadline";
        const mark = task.dueOn && task.dueOn < day ? "TE LAAT" : task.dueOn === day ? "VANDAAG" : "";
        return `- [${task.priority}] ${task.kind.toUpperCase()} ${task.status} ${mark} ${task.title} | ${who} | ${where} | ${due}${task.cause ? ` | aanleiding: ${task.cause}` : ""}`;
      });
      const projects = work.projects
        .filter((project) => project.status === "actief")
        .map((project) => {
          const progress = projectProgress(work.tasks, project.id);
          return `- ${project.name}: ${progress.done}/${progress.total} klaar (${progress.pct}%)`;
        });
      const late = open.filter((task) => task.dueOn && task.dueOn < day).length;
      const high = open.filter((task) => task.priority === "hoog").length;
      const cip = open.filter((task) => task.kind === "cip").length;
      const prompt = `Datum: ${day}. Open: ${open.length}. Te laat: ${late}. Prio hoog: ${high}. Open CIP: ${cip}.
Storingen: ${fails.map((item) => item.title).join(", ") || "geen"}.
Lease binnen 90 dagen: ${ending.map((asset) => `${asset.name} einde ${asset.endsOn}`).join(", ") || "geen"}.

Taken:\n${lines.join("\n")}\n\nProjecten:\n${projects.join("\n") || "- geen actief project"}`;
      const answer = await grok(BRIEF_SYSTEM, prompt);
      if (!answer.ok) return answer;
      body = answer.text;
    }
    const id = uid();
    await sql`
      insert into briefings (id, user_id, day, body)
      values (${id}, ${userId}, ${day}, ${body})
      on conflict (user_id, day) do update set body = excluded.body, created_at = now()`;
    return { ok: true as const, day, body, cached: false as const };
  });

