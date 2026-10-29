import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { PERMISSIONS, isRole, memberChangeBlocker, requirePermission, type Role, type Step } from "@/lib/auth/permissions";
import { normalizeEmail } from "@/lib/auth/membership";
import { db, str, uid } from "@/lib/ops-shared";

export type Member = { id: string; email: string; role: Role; pending: boolean; me: boolean };
export type MembersView = { role: Role; steps: Step[]; members: Member[] };

type Sql = Awaited<ReturnType<typeof db>>;

async function zaakMembers(sql: Sql, zaakId: string, actorId: string): Promise<Member[]> {
  const rows = await sql<Record<string, unknown>>`
    select m.id, m.user_id, coalesce(nullif(m.email, ''), u.email, '') as email, m.role
    from zaak_members m left join "user" u on u.id = m.user_id
    where m.zaak_id = ${zaakId} order by m.created_at, m.id`;
  return rows.map((r) => ({
    id: str(r.id, 80),
    email: str(r.email, 160),
    role: isRole(r.role) ? r.role : "lezer",
    pending: r.user_id == null,
    me: r.user_id === actorId,
  }));
}

/** Eigen rol en ledenlijst van de zaak. Elke rol mag de lijst zien. */
export const loadMembers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MembersView> => {
    const sql = await db();
    return {
      role: context.role,
      steps: [...PERMISSIONS[context.role]],
      members: await zaakMembers(sql, context.userId, context.actorId),
    };
  });

/**
 * Nodigt een account uit per e-mail. Er wordt (nog) geen mail verstuurd: wie zich
 * met dat adres aanmeldt, komt bij de volgende aanvraag in deze zaak terecht.
 */
export const inviteMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as { email?: unknown; role?: unknown };
    if (!isRole(row.role)) throw new Error("Kies een rol.");
    return { email: normalizeEmail(row.email), role: row.role };
  })
  .handler(async ({ context, data }) => {
    requirePermission(context, "beheer");
    const sql = await db();
    const dup = await sql`select id from zaak_members where zaak_id = ${context.userId} and email = ${data.email}`;
    if (dup[0]) throw new Error("Dit adres is al lid of uitgenodigd.");
    const users = await sql<{ id: string }>`select id from "user" where lower(email) = ${data.email}`;
    const existing = users[0]?.id;
    if (existing) {
      // Een bestaand account mag alleen overstappen als zijn eigen zaak leeg is
      // (geen zaakfiche, geen andere leden). Zo verdwijnen er nooit gegevens uit zicht.
      const own = await sql<{ zaak_id: string }>`select zaak_id from zaak_members where user_id = ${existing}`;
      if (own[0]) {
        const zaak = own[0].zaak_id;
        const others = await sql`select id from zaak_members where zaak_id = ${zaak} and user_id is distinct from ${existing}`;
        const company = await sql`select 1 from companies where user_id = ${zaak}`;
        if (zaak !== existing || others[0] || company[0]) {
          throw new Error("Dit account hoort al bij een zaak met gegevens. Laat het een ander adres gebruiken.");
        }
        await sql`delete from zaak_members where user_id = ${existing}`;
      }
    }
    await sql`
      insert into zaak_members (id, zaak_id, user_id, email, role, invited_by)
      values (${uid()}, ${context.userId}, ${existing ?? null}, ${data.email}, ${data.role}, ${context.actorId})`;
    return { ok: true as const, pending: !existing };
  });

export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input ?? {}) as { id?: unknown; role?: unknown };
    if (!isRole(row.role)) throw new Error("Kies een rol.");
    return { id: str(row.id, 80), role: row.role };
  })
  .handler(async ({ context, data }) => {
    requirePermission(context, "beheer");
    const sql = await db();
    const blocker = memberChangeBlocker(await zaakMembers(sql, context.userId, context.actorId), data.id, data.role);
    if (blocker) throw new Error(blocker);
    await sql`update zaak_members set role = ${data.role} where id = ${data.id} and zaak_id = ${context.userId}`;
    return { ok: true as const };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => str(typeof input === "string" ? input : (input as { id?: string })?.id, 80))
  .handler(async ({ context, data: id }) => {
    requirePermission(context, "beheer");
    const sql = await db();
    const blocker = memberChangeBlocker(await zaakMembers(sql, context.userId, context.actorId), id, null);
    if (blocker) throw new Error(blocker);
    // Het account valt terug op een eigen, lege zaak (zie membership.ts).
    await sql`delete from zaak_members where id = ${id} and zaak_id = ${context.userId}`;
    return { ok: true as const };
  });
