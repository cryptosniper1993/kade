import { resolveMembership, type Membership } from "./membership.ts";

/** Zaak en rol van het ingelogde account (server-only), op de gedeelde SQL-client. */
export async function membershipFor(userId: string): Promise<Membership> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  return resolveMembership(
    {
      async byUser(id) {
        const rows = await sql<{ zaak_id: string; role: string }>`
          select zaak_id, role from zaak_members where user_id = ${id} limit 1`;
        return rows[0] ? { zaakId: rows[0].zaak_id, role: rows[0].role } : null;
      },
      async emailOf(id) {
        const rows = await sql<{ email: string }>`select email from "user" where id = ${id}`;
        return rows[0]?.email ?? "";
      },
      async claimInvite(email, id) {
        const rows = await sql<{ zaak_id: string; role: string }>`
          update zaak_members set user_id = ${id}
          where id = (select id from zaak_members where user_id is null and email = ${email}
                      order by created_at limit 1)
          returning zaak_id, role`;
        return rows[0] ? { zaakId: rows[0].zaak_id, role: rows[0].role } : null;
      },
      async createOwn(id, email) {
        await sql`
          insert into zaak_members (id, zaak_id, user_id, email, role)
          values (${"own-" + id}, ${id}, ${id}, ${email}, 'eigenaar')
          on conflict do nothing`;
      },
    },
    userId,
  );
}
