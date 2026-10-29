import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addWorkdays, assertProjectScope, canSeeProject, canSeeProspects, checkOutbound, contextBlocker, expired, followUpDue,
  nonPlainChars, parseBatchJson, parseCsvStatus, parseProspectsCsv, pickBatch, plainify, proRataThreshold, sendBlocker,
  sha256Hex, splitCsvLine, thresholdState, type Prospect,
} from "./outreach.ts";

describe("CSV-import", () => {
  it("leest BOM, ; en aanhalingstekens", () => {
    const csv = "\uFEFFnr;bedrijf;branche;gemeente;afstand_indicatie;website;email;telefoon;bron;haakje;prioriteit;opmerking;status\n" +
      '1;"Bakkerij ""De Zon""";bakker;Geel;5km;x.be;Info@X.be;014;https://x.be/contact;planning;a;;verzonden 27/10\n' +
      "2;Garage Y;auto;Mol;;;;;;;C;geen mail;\n2;Dubbel;;;;;;;;;;;\n";
    const { rows, errors } = parseProspectsCsv(csv, 2026);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].bedrijf, 'Bakkerij "De Zon"');
    assert.equal(rows[0].email, "info@x.be");
    assert.equal(rows[0].prioriteit, "A");
    assert.equal(rows[0].status, "verzonden");
    assert.equal(rows[0].sentOn, "2026-10-27");
    assert.equal(rows[1].status, "nieuw");
    assert.equal(errors.length, 1);
  });
  it("splitst en herkent statussen", () => {
    assert.deepEqual(splitCsvLine('a;"b;c";d'), ["a", "b;c", "d"]);
    assert.equal(parseCsvStatus("bounce", 2026).status, "bounce");
    assert.equal(parseCsvStatus("iets raars", 2026).note, "iets raars");
  });
  it("leest batch-JSON", () => {
    const m = parseBatchJson('[{"nr":43,"bedrijf":"A","to":"a@b.be","subject":"S","body":"B"},{"nr":0}]');
    assert.equal(m.length, 1);
    assert.equal(m[0].nr, 43);
  });
});

describe("Uitgaande filters", () => {
  it("vindt rare tekens en maakt ze plat", () => {
    const t = "Dag \u2018x\u2019 \u2013 10 m\u00B3 \u2022 caf\u00E9";
    assert.deepEqual(nonPlainChars(t).sort(), ["\u2013", "\u2018", "\u2019", "\u2022", "\u00B3"].sort());
    assert.deepEqual(nonPlainChars(plainify(t)), []);
  });
  it("blokkeert verboden namen (uit de database), prijzen en links in koude mails", () => {
    const issues = checkOutbound("Bij Acme NV haalden we 30% winst. Prijs: 500 euro. www.x.be", { forbiddenNames: ["Acme NV", "ZZ"], cold: true });
    const codes = issues.map((i) => i.code);
    assert.ok(codes.includes("naam"));
    assert.ok(codes.includes("prijs"));
    assert.ok(codes.includes("link"));
    assert.ok(codes.includes("afmelding"));
    assert.ok(!issues.some((i) => i.detail.includes("ZZ")));
  });
  it("laat een propere koude mail door", () => {
    const body = "Goedemorgen,\n\nPlant u nog alles op papier? Graag een vrijblijvende kennismaking.\n\nWenst u geen verdere berichten? Laat het gerust weten.";
    assert.deepEqual(checkOutbound(body, { forbiddenNames: ["Acme"], cold: true }), []);
  });
  it("naam binnen een ander woord telt niet", () => {
    assert.deepEqual(checkOutbound("Wenst u geen verdere berichten? Kansen", { forbiddenNames: ["NS"], cold: false }), []);
  });
});

describe("Verzendvenster en opvolging", () => {
  it("alleen di-do 08:30-11:00 Brussel en daglimiet", () => {
    assert.equal(sendBlocker(new Date("2026-11-03T08:00:00Z"), 0), null); // di 09:00 CET
    assert.match(sendBlocker(new Date("2026-11-02T08:00:00Z"), 0) ?? "", /dinsdag/); // maandag
    assert.match(sendBlocker(new Date("2026-11-03T10:30:00Z"), 0) ?? "", /tussen/); // 11:30
    assert.match(sendBlocker(new Date("2026-11-03T08:00:00Z"), 15) ?? "", /Daglimiet/);
  });
  it("7 werkdagen opvolging", () => {
    assert.equal(addWorkdays("2026-10-27", 7), "2026-11-05");
    assert.equal(followUpDue({ status: "verzonden", sentOn: "2026-10-27" }, "2026-11-04"), false);
    assert.equal(followUpDue({ status: "verzonden", sentOn: "2026-10-27" }, "2026-11-05"), true);
    assert.equal(followUpDue({ status: "opgevolgd", sentOn: "2026-10-27" }, "2026-12-01"), false);
  });
  it("12 maanden zonder reactie vervalt", () => {
    assert.equal(expired({ status: "verzonden", sentOn: "2025-10-01", lastContactOn: null }, "2026-10-29"), true);
    assert.equal(expired({ status: "klant", sentOn: "2025-10-01", lastContactOn: null }, "2026-10-29"), false);
  });
  it("kiest A voor B, slaat geblokkeerd en C over", () => {
    const p = (nr: number, prio: Prospect["prioriteit"], email = `${nr}@x.be`): Prospect => ({ id: String(nr), nr, bedrijf: "", branche: "", gemeente: "", afstand: "", website: "", email, telefoon: "", bron: "", haakje: "", prioriteit: prio, opmerking: "", status: "nieuw", statusNote: "", sentOn: null, batch: null, lastContactOn: null });
    const pick = pickBatch([p(1, "B"), p(2, "A"), p(3, "C"), p(4, "A", ""), p(5, "A")], new Set(["5@x.be"]), 15);
    assert.deepEqual(pick.map((x) => x.nr), [2, 1]);
  });
});

describe("Scopes en vertrouwelijkheid", () => {
  const proj = { kind: "project", projectId: "p1" } as const;
  it("projectbot ziet alleen eigen project, geen prospecten", () => {
    assert.equal(canSeeProject(proj, "p1"), true);
    assert.equal(canSeeProject(proj, "p2"), false);
    assert.equal(canSeeProspects(proj), false);
    assert.equal(canSeeProject({ kind: "sales" }, "p2"), true);
    assert.throws(() => assertProjectScope(proj, "p2"));
    assert.throws(() => assertProjectScope(proj, null));
  });
  it("geen context van een ander (vertrouwelijk) project naar een projectbot", () => {
    const projects = [{ id: "p1", confidential: false }, { id: "p2", confidential: true }];
    assert.equal(contextBlocker(proj, ["p1"], projects, "projecten"), null);
    assert.match(contextBlocker(proj, ["p2"], projects, "projecten") ?? "", /ander project/);
    assert.match(contextBlocker(proj, ["inv-9"], projects, "facturen") ?? "", /eigen project/);
    assert.equal(contextBlocker({ kind: "sales" }, ["p2"], projects, "x"), null);
  });
  it("hasht sleutels", async () => {
    assert.equal((await sha256Hex("abc")).slice(0, 8), "ba7816bf");
  });
});

describe("Vrijstellingsdrempel", () => {
  it("pro rata voor startjaar 1/11/2026 ≈ 4.178", () => {
    assert.equal(proRataThreshold(25000, "2026-11-01", 2026), 4178);
    assert.equal(proRataThreshold(25000, "2026-11-01", 2027), 25000);
    assert.equal(proRataThreshold(25000, null, 2026), 25000);
  });
  it("niveaus", () => {
    assert.equal(thresholdState(1000, 4178).level, "ok");
    assert.equal(thresholdState(3500, 4178).level, "zicht");
    assert.equal(thresholdState(5000, 4178).level, "over");
  });
});
