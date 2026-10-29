import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail, resolveMembership, type MembershipStore } from "./membership.ts";

type Row = { zaakId: string; userId: string | null; email: string; role: string };

function store(rows: Row[], emails: Record<string, string> = {}): MembershipStore & { rows: Row[] } {
  return {
    rows,
    async byUser(id) {
      const r = rows.find((m) => m.userId === id);
      return r ? { zaakId: r.zaakId, role: r.role } : null;
    },
    async emailOf(id) {
      return emails[id] ?? "";
    },
    async claimInvite(email, id) {
      const r = rows.find((m) => m.userId === null && m.email === email);
      if (!r) return null;
      r.userId = id;
      return { zaakId: r.zaakId, role: r.role };
    },
    async createOwn(id, email) {
      rows.push({ zaakId: id, userId: id, email, role: "eigenaar" });
    },
  };
}

describe("zaak en rol per account", () => {
  it("bestaand lid krijgt zijn zaak en rol", async () => {
    const s = store([{ zaakId: "nick", userId: "an", email: "an@x.be", role: "boekhouder" }]);
    assert.deepEqual(await resolveMembership(s, "an"), { zaakId: "nick", role: "boekhouder" });
  });
  it("uitnodiging wordt bij aanmelden gekoppeld", async () => {
    const s = store([{ zaakId: "nick", userId: null, email: "jo@x.be", role: "medewerker" }], { jo: "Jo@X.be " });
    assert.deepEqual(await resolveMembership(s, "jo"), { zaakId: "nick", role: "medewerker" });
    assert.equal(s.rows[0].userId, "jo");
  });
  it("zonder lidmaatschap: Eigenaar van de eigen zaak (bestaand gedrag)", async () => {
    const s = store([]);
    assert.deepEqual(await resolveMembership(s, "dev-user"), { zaakId: "dev-user", role: "eigenaar" });
    assert.equal(s.rows.length, 1);
  });
  it("onbekende rol in de database valt terug op alleen lezen", async () => {
    const s = store([{ zaakId: "nick", userId: "x", email: "", role: "superuser" }]);
    assert.deepEqual(await resolveMembership(s, "x"), { zaakId: "nick", role: "lezer" });
  });
  it("valideert e-mailadressen", () => {
    assert.equal(normalizeEmail(" An@Voorbeeld.BE "), "an@voorbeeld.be");
    assert.throws(() => normalizeEmail("geen-adres"), /geldig/);
  });
});
