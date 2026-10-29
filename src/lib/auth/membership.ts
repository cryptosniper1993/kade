import { isRole, type Role } from "./permissions.ts";

/**
 * Welke zaak en rol hoort bij een account? Pure logica met een ingespoten
 * opslag, zodat ze zonder database te testen is (`membership.test.ts`).
 *
 * Volgorde:
 *  1. Het account is al lid van een zaak → die zaak en rol.
 *  2. Er staat een openstaande uitnodiging voor het e-mailadres → koppelen.
 *  3. Anders is het account Eigenaar van zijn eigen zaak (`zaak_id = user_id`),
 *     zoals vóór de rollen: bestaande gegevens blijven gewoon zichtbaar.
 */
export type Membership = { zaakId: string; role: Role };

export type MembershipStore = {
  byUser(userId: string): Promise<{ zaakId: string; role: string } | null>;
  emailOf(userId: string): Promise<string>;
  claimInvite(email: string, userId: string): Promise<{ zaakId: string; role: string } | null>;
  createOwn(userId: string, email: string): Promise<void>;
};

export async function resolveMembership(store: MembershipStore, userId: string): Promise<Membership> {
  const found = await store.byUser(userId);
  if (found) {
    // Onbekende rol in de database: veilig terugvallen op alleen lezen.
    return { zaakId: found.zaakId, role: isRole(found.role) ? found.role : "lezer" };
  }
  const email = (await store.emailOf(userId)).trim().toLowerCase();
  if (email) {
    const invite = await store.claimInvite(email, userId);
    if (invite) return { zaakId: invite.zaakId, role: isRole(invite.role) ? invite.role : "lezer" };
  }
  await store.createOwn(userId, email);
  return { zaakId: userId, role: "eigenaar" };
}

export function normalizeEmail(value: unknown): string {
  const email = String(value ?? "").trim().toLowerCase().slice(0, 160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Geef een geldig e-mailadres.");
  return email;
}
