/**
 * Rollen en rechten per zaak — de ENIGE plek waar de matrix staat.
 *
 * Pure module (geen server-imports): de server gebruikt ze in `requirePermission`
 * (zie `guard.ts`), de interface om knoppen te verbergen. Verbergen in de
 * interface is extra; de bescherming zit server-side.
 *
 * Wijzig je de matrix, pas dan ook de tabel in `docs/handleiding/rollen.md` aan.
 */

export const ROLES = ["eigenaar", "boekhouder", "medewerker", "lezer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  eigenaar: "Eigenaar",
  boekhouder: "Boekhouder",
  medewerker: "Medewerker",
  lezer: "Alleen lezen",
};

/**
 * Stappen die server-side gecontroleerd worden. Lezen mag elke rol.
 * 1–5 zijn de afgesproken gevoelige stappen; `werk`, `concept` en `boeken`
 * dekken de overige schrijfacties zodat "Alleen lezen" echt niets schrijft.
 */
export const STEPS = [
  "werk", // dagelijks werk: taken, projecten, personen, documenten, inventaris, incidenten
  "concept", // concept-offertes en -facturen opmaken, relaties bijhouden
  "versturen", // 1. facturen en offertes versturen / uitreiken, creditnota's
  "btw", // 2. btw-aangifte voorbereiden en indienen
  "peppol", // 3. Peppol en inkomende facturen goedkeuren
  "boeken", // boekingen, betalingen, afschrijvingen (financieel)
  "bots", // 4. bots en agents laten handelen
  "beheer", // 5. leden en instellingen beheren
] as const;
export type Step = (typeof STEPS)[number];

export const STEP_LABELS: Record<Step, string> = {
  werk: "Dagelijks werk (taken, projecten, documenten)",
  concept: "Concept-offertes en -facturen opmaken",
  versturen: "Facturen en offertes versturen",
  btw: "Btw-aangifte indienen",
  peppol: "Peppol en inkomende facturen goedkeuren",
  boeken: "Boekingen en betalingen",
  bots: "Bots en agents laten handelen",
  beheer: "Leden en instellingen beheren",
};

export const PERMISSIONS: Record<Role, readonly Step[]> = {
  eigenaar: STEPS,
  boekhouder: ["werk", "concept", "versturen", "btw", "peppol", "boeken"],
  medewerker: ["werk", "concept"],
  lezer: [],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role | null | undefined, step: Step): boolean {
  if (!role || !isRole(role)) return false;
  return PERMISSIONS[role].includes(step);
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(role: Role | null | undefined, step: Step) {
    const who = role && isRole(role) ? ROLE_LABELS[role] : "Onbekende rol";
    super(`Geen toegang: ${who} mag "${STEP_LABELS[step]}" niet.`);
    this.name = "ForbiddenError";
  }
}

/** Server-side guard. Gooit `ForbiddenError` als de rol de stap niet mag. */
export function requirePermission(context: { role?: Role | null }, step: Step): void {
  if (!can(context.role, step)) throw new ForbiddenError(context.role, step);
}

export type MemberLite = { id: string; role: Role };

/**
 * Leden-wijziging toegestaan? Blokkeert verwijderen of degraderen van de
 * laatste Eigenaar. `nextRole === null` betekent verwijderen.
 */
export function memberChangeBlocker(members: readonly MemberLite[], memberId: string, nextRole: Role | null): string | null {
  const target = members.find((m) => m.id === memberId);
  if (!target) return "Lid niet gevonden.";
  if (target.role !== "eigenaar" || nextRole === "eigenaar") return null;
  const owners = members.filter((m) => m.role === "eigenaar").length;
  return owners <= 1 ? "Een zaak heeft altijd minstens één Eigenaar." : null;
}
