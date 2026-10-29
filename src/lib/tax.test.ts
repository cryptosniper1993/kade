import { test } from "node:test";
import assert from "node:assert/strict";
import { duties, exemptThreshold, shiftWeekend, thresholdState, TAX_GUIDE, dailyTips } from "./tax.ts";
import { invoiceTotals, ogmFromSequence } from "./finance.ts";
import { productionAuthProblems } from "./auth/prod-guard.server.ts";
import type { Company } from "./types";

const company: Company = { name: "K", legalForm: "eenmanszaak", vatNumber: "", enterpriseNumber: "", address: "", city: "", email: "", iban: "", vatRegime: "quarterly", activityStatus: "bijberoep", yearEndMonth: 12 };

test("weekend schuift naar maandag", () => {
  assert.equal(shiftWeekend("2026-04-25"), "2026-04-27"); // zaterdag
  assert.equal(shiftWeekend("2026-01-25"), "2026-01-26"); // zondag
  assert.equal(shiftWeekend("2026-10-26"), "2026-10-26");
  const d = duties(company, new Date(2026, 3, 1)).find((x) => x.id === "vat-q");
  assert.equal(d?.date, "2026-04-27");
  assert.match(d?.detail ?? "", /schuift naar 27\/04\/2026/);
});

test("drempel vrijstellingsregeling per jaar + tolerantie", () => {
  assert.equal(exemptThreshold(2026), 25000);
  assert.equal(exemptThreshold(2027), 26000);
  assert.equal(exemptThreshold(2030), 26000);
  assert.equal(exemptThreshold(2026, 30000), 30000);
  assert.equal(thresholdState(10000, 25000), "under");
  assert.equal(thresholdState(20000, 25000), "near");
  assert.equal(thresholdState(27000, 25000), "tolerance");
  assert.equal(thresholdState(27600, 25000), "over");
});

test("geen standaard-BV; bijberoep krijgt sociale bijdragen", () => {
  const none = duties({ ...company, legalForm: "" }, new Date(2026, 9, 29));
  assert.ok(none.some((d) => d.id === "form"));
  assert.ok(!none.some((d) => d.id === "contrib"), "zonder rechtsvorm geen vennootschapsplichten");
  assert.ok(duties(null, new Date(2026, 9, 29)).some((d) => d.id === "form"));
  const bij = duties(company, new Date(2026, 9, 29));
  assert.ok(bij.some((d) => d.id === "social-q" && d.date === "2026-12-31"));
  assert.ok(!duties({ ...company, activityStatus: "hoofdberoep" }, new Date(2026, 9, 29)).some((d) => d.id === "social-q"));
});

test("bewaartermijn zeven jaar, geen 'tien jaar' meer", () => {
  const all = JSON.stringify(TAX_GUIDE) + JSON.stringify(dailyTips({ income: 0, profit: 0, cash: 1, directorPay: 0, prepayments: 0, estimatedTax: 0, vatNet: 0 } as never, company, []));
  assert.doesNotMatch(all, /tien jaar/);
  assert.match(all, /zeven jaar/);
});

test("invoiceTotals en OGM", () => {
  assert.deepEqual(invoiceTotals([{ description: "a", qty: 3, unitExVat: 100.005, vatRate: 21 }, { description: "b", qty: 1, unitExVat: 20, vatRate: 6 }]), { ex: 320.02, vat: 64.2, incl: 384.22 });
  assert.equal(invoiceTotals([{ description: "a", qty: 1, unitExVat: 100, vatRate: 21 }], true).vat, 0);
  assert.equal(ogmFromSequence(1), "+++000/0000/00101+++");
  assert.equal(ogmFromSequence(97), "+++000/0000/09797+++");
  const ogm = ogmFromSequence(123456).replace(/\D/g, "");
  assert.equal(Number(ogm.slice(0, 10)) % 97 || 97, Number(ogm.slice(10)));
});

test("productie weigert onveilige auth", () => {
  assert.deepEqual(productionAuthProblems({ NODE_ENV: "development", VITE_AUTH_ENABLED: "false" }), []);
  assert.equal(productionAuthProblems({ NODE_ENV: "production", GROK_PROJECT_ID: "p", VITE_AUTH_ENABLED: "false" }).length, 3);
  assert.deepEqual(productionAuthProblems({ NODE_ENV: "production", GROK_PROJECT_ID: "p", GROK_AUTH_CLIENT_ID: "a", GROK_AUTH_CLIENT_SECRET: "b", BETTER_AUTH_SECRET: "c" }), []);
  assert.deepEqual(productionAuthProblems({ NODE_ENV: "production", GROK_PROJECT_ID: "p", VITE_AUTH_ENABLED: "false", KADE_ALLOW_INSECURE_AUTH: "true" }), []);
});
