import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ForbiddenError,
  PERMISSIONS,
  ROLES,
  STEPS,
  can,
  memberChangeBlocker,
  requirePermission,
  type Role,
  type Step,
} from "./permissions.ts";

const matrix: Record<Role, Step[]> = {
  eigenaar: ["werk", "concept", "versturen", "btw", "peppol", "boeken", "bots", "beheer"],
  boekhouder: ["werk", "concept", "versturen", "btw", "peppol", "boeken"],
  medewerker: ["werk", "concept"],
  lezer: [],
};

describe("rollenmatrix", () => {
  it("komt exact overeen met de afgesproken tabel", () => {
    for (const role of ROLES) {
      for (const step of STEPS) {
        assert.equal(can(role, step), matrix[role].includes(step), `${role} / ${step}`);
      }
    }
  });
  it("Eigenaar mag alles, Alleen lezen niets", () => {
    assert.deepEqual([...PERMISSIONS.eigenaar], [...STEPS]);
    assert.equal(PERMISSIONS.lezer.length, 0);
  });
  it("Boekhouder en Medewerker mogen geen bots of beheer", () => {
    for (const role of ["boekhouder", "medewerker"] as const) {
      assert.equal(can(role, "bots"), false);
      assert.equal(can(role, "beheer"), false);
    }
    assert.equal(can("medewerker", "versturen"), false);
    assert.equal(can("medewerker", "btw"), false);
    assert.equal(can("medewerker", "peppol"), false);
  });
  it("onbekende of ontbrekende rol mag niets", () => {
    assert.equal(can(null, "werk"), false);
    assert.equal(can("admin" as Role, "werk"), false);
  });
});

describe("server-side guard", () => {
  it("laat toegestane stappen door", () => {
    assert.doesNotThrow(() => requirePermission({ role: "boekhouder" }, "btw"));
    assert.doesNotThrow(() => requirePermission({ role: "medewerker" }, "concept"));
  });
  it("weigert met ForbiddenError (403) en een Nederlandse melding", () => {
    assert.throws(
      () => requirePermission({ role: "medewerker" }, "versturen"),
      (e: unknown) => e instanceof ForbiddenError && e.status === 403 && /Medewerker/.test(e.message),
    );
    assert.throws(() => requirePermission({ role: "lezer" }, "werk"), ForbiddenError);
    assert.throws(() => requirePermission({}, "werk"), ForbiddenError);
  });
});

describe("laatste Eigenaar", () => {
  const members = [
    { id: "a", role: "eigenaar" as const },
    { id: "b", role: "boekhouder" as const },
  ];
  it("kan niet verwijderd of gedegradeerd worden", () => {
    assert.match(memberChangeBlocker(members, "a", null) ?? "", /minstens één Eigenaar/);
    assert.match(memberChangeBlocker(members, "a", "lezer") ?? "", /minstens één Eigenaar/);
  });
  it("andere wijzigingen mogen", () => {
    assert.equal(memberChangeBlocker(members, "a", "eigenaar"), null);
    assert.equal(memberChangeBlocker(members, "b", null), null);
    assert.equal(memberChangeBlocker([...members, { id: "c", role: "eigenaar" }], "a", null), null);
    assert.equal(memberChangeBlocker(members, "x", null), "Lid niet gevonden.");
  });
});
