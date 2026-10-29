/**
 * Inkomende bot-API (dossier §4, §5, §11). Elke bot heeft een eigen sleutel (Beheer > Instellingen > Bot-API)
 * met een scope: "sales" (joly jumper: alles + prospectie) of "project" (alleen het eigen project).
 * Bots schrijven ALTIJD concepten. Er is bewust geen verzend-endpoint: verzenden kan alleen in KADE
 * met het approval-token van Kobe.
 */
import { getSql } from "@/lib/db";
import { str, uid } from "@/lib/ops-shared";
import { applyProspectStatus, audit, createApproval, mapApproval, mapProspect, validApprovalInput } from "@/lib/ops-jam";
import { assertProjectScope, canSeeProject, canSeeProspects, scopeOf, sha256Hex, type BotScope, type ProspectStatus } from "@/lib/outreach";

type Bot = { id: string; userId: string; name: string; scope: BotScope; actor: string };
const BOT_PROSPECT_STATUSES: ProspectStatus[] = ["concept", "antwoord_positief", "antwoord_negatief", "afgemeld", "bounce", "overgeslagen", "nieuw"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

async function authBot(request: Request): Promise<Bot | null> {
  const header = request.headers.get("authorization") ?? "";
  const key = header.replace(/^Bearer\s+/i, "").trim();
  if (!key.startsWith("kade_bot_")) return null;
  const sql = await getSql();
  const rows = await sql<Record<string, unknown>>`select * from bot_keys where key_hash = ${await sha256Hex(key)} and active = true`;
  const r = rows[0];
  if (!r) return null;
  const scope = scopeOf({ scope: str(r.scope, 10), project_id: r.project_id ? str(r.project_id, 80) : null });
  if (!scope) return null;
  await sql`update bot_keys set last_used_at = now() where id = ${str(r.id, 80)}`;
  return { id: str(r.id, 80), userId: str(r.user_id, 80), name: str(r.name, 80), scope, actor: `bot:${str(r.name, 60)}` };
}

export async function handleBotApi(request: Request, path: string): Promise<Response> {
  try {
    const bot = await authBot(request);
    if (!bot) return json({ error: "Ongeldige of ingetrokken bot-sleutel." }, 401);
    const sql = await getSql();
    const u = bot.userId;
    const method = request.method.toUpperCase();
    const parts = path.split("/").filter(Boolean);
    const body = method === "POST" ? ((await request.json().catch(() => ({}))) as Record<string, unknown>) : {};

    if (method === "GET" && parts[0] === "me") {
      return json({ name: bot.name, scope: bot.scope, kanVerzenden: false });
    }
    if (method === "GET" && parts[0] === "projects") {
      const rows = await sql<Record<string, unknown>>`select id, name, client_name, status, phase, confidential, contacts, next_action, note, due_on::text as due_on
        from projects where user_id = ${u} order by created_at desc`;
      const visible = rows.filter((r) => canSeeProject(bot.scope, str(r.id, 80)));
      const ids = visible.map((r) => str(r.id, 80));
      const tasks = ids.length ? await sql<Record<string, unknown>>`select id, project_id, title, detail, status, priority, due_on::text as due_on
        from tasks where user_id = ${u} and project_id = any(${ids})` : [];
      const quotes = ids.length ? await sql<Record<string, unknown>>`select id, project_id, number, client_name, status, issue_date::text as issue_date
        from quotes where user_id = ${u} and project_id = any(${ids})` : [];
      return json({
        projects: visible.map((p) => ({
          ...p, tasks: tasks.filter((t) => t.project_id === p.id), quotes: quotes.filter((q) => q.project_id === p.id),
        })),
      });
    }
    if (method === "GET" && parts[0] === "prospects") {
      if (!canSeeProspects(bot.scope)) return json({ error: "Alleen de sales-bot ziet prospecten." }, 403);
      const rows = await sql<Record<string, unknown>>`select * from prospects where user_id = ${u} order by nr`;
      const batches = await sql<Record<string, unknown>>`select nr, created_on::text as created_on, note from prospect_batches where user_id = ${u} order by nr`;
      return json({ prospects: rows.map(mapProspect), batches });
    }
    if (method === "GET" && parts[0] === "do-not-contact") {
      if (!canSeeProspects(bot.scope)) return json({ error: "Alleen de sales-bot ziet de niet-contacteren-lijst." }, 403);
      const rows = await sql<{ email: string }>`select email from do_not_contact where user_id = ${u} order by email`;
      return json({ emails: rows.map((r) => r.email) });
    }
    if (parts[0] === "approvals" && method === "GET") {
      const rows = await sql<Record<string, unknown>>`select * from approvals where user_id = ${u} and created_by = ${bot.actor} order by created_at desc limit 100`;
      return json({ items: rows.map(mapApproval).map(({ originalBody: _o, ...rest }) => rest) });
    }
    if (parts[0] === "approvals" && method === "POST") {
      const input = validApprovalInput(body);
      assertProjectScope(bot.scope, input.projectId);
      if (input.prospectNr != null && !canSeeProspects(bot.scope)) return json({ error: "Buiten de scope van deze bot." }, 403);
      const item = await createApproval(sql, u, bot.actor, input);
      return json({ id: item.id, status: item.status, issues: item.issues }, 201);
    }
    if (parts[0] === "notes" && method === "POST") {
      const projectId = str(body.projectId, 80);
      assertProjectScope(bot.scope, projectId);
      const note = str(body.note, 1500);
      if (!note) return json({ error: "Notitie ontbreekt." }, 400);
      const line = `[${new Date().toISOString().slice(0, 16).replace("T", " ")} ${bot.name}] ${note}`;
      const rows = await sql<{ id: string }>`update projects set note = left(case when note = '' then ${line} else note || E'\\n' || ${line} end, 8000)
        where id = ${projectId} and user_id = ${u} returning id`;
      if (!rows[0]) return json({ error: "Project niet gevonden." }, 404);
      await audit(sql, u, bot.actor, "project.note", "project", projectId, note.slice(0, 200));
      return json({ ok: true }, 201);
    }
    if (parts[0] === "next-action" && method === "POST") {
      const projectId = str(body.projectId, 80);
      assertProjectScope(bot.scope, projectId);
      const rows = await sql<{ id: string }>`update projects set next_action = ${str(body.nextAction, 400)} where id = ${projectId} and user_id = ${u} returning id`;
      if (!rows[0]) return json({ error: "Project niet gevonden." }, 404);
      await audit(sql, u, bot.actor, "project.next_action", "project", projectId, str(body.nextAction, 200));
      return json({ ok: true });
    }
    if (parts[0] === "tasks" && method === "POST") {
      const projectId = str(body.projectId, 80) || null;
      assertProjectScope(bot.scope, projectId);
      const title = str(body.title, 180);
      if (!title) return json({ error: "Titel ontbreekt." }, 400);
      if (projectId) {
        const p = await sql<{ id: string }>`select id from projects where id = ${projectId} and user_id = ${u}`;
        if (!p[0]) return json({ error: "Project niet gevonden." }, 404);
      }
      const id = uid();
      await sql`insert into tasks (id, user_id, project_id, title, detail, kind, cause, priority, status)
        values (${id}, ${u}, ${projectId}, ${title}, ${str(body.detail, 800)}, 'todo', ${`Voorstel van ${bot.name}`}, 'normaal', 'open')`;
      await audit(sql, u, bot.actor, "task.propose", "task", id, title);
      return json({ id }, 201);
    }
    if (parts[0] === "prospects" && parts[1] && method === "POST") {
      if (!canSeeProspects(bot.scope)) return json({ error: "Alleen de sales-bot schrijft prospecten." }, 403);
      const nr = Number(parts[1]);
      const status = str(body.status, 24) as ProspectStatus;
      if (!BOT_PROSPECT_STATUSES.includes(status)) return json({ error: `Bots zetten alleen: ${BOT_PROSPECT_STATUSES.join(", ")}.` }, 400);
      await applyProspectStatus(sql, u, nr, status, str(body.note, 400));
      await audit(sql, u, bot.actor, "prospect.status", "prospect", String(nr), status);
      return json({ ok: true });
    }
    if (parts[0] === "send" || parts[0] === "verzend") {
      return json({ error: "Bots kunnen niet verzenden. Kobe keurt goed en verzendt in KADE." }, 403);
    }
    return json({ error: "Onbekend endpoint." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fout";
    return json({ error: message }, message.includes("scope") ? 403 : 400);
  }
}
