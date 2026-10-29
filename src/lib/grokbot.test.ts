import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { authHeader, buildGrokPayload, maskKey, parseGrokCommand, validWebhookUrl } from "./grokbot.ts";

describe("buildGrokPayload", () => {
  it("bouwt de verwachte vorm", () => {
    const p = buildGrokPayload("  Maak een offerte  ", { view: "invoices", ids: ["a", ""], samenvatting: "3 open" }, new Date("2026-10-29T10:00:00Z"));
    assert.deepEqual(p, {
      opdracht: "Maak een offerte",
      context: { view: "invoices", ids: ["a"], samenvatting: "3 open" },
      bron: "kade",
      tijd: "2026-10-29T10:00:00.000Z",
    });
  });
  it("weigert lege opdrachten", () => {
    assert.throws(() => buildGrokPayload("   ", { view: "x" }));
  });
  it("kapt lange tekst af", () => {
    assert.equal(buildGrokPayload("x".repeat(5000), { view: "v" }).opdracht.length, 4000);
  });
});

describe("helpers", () => {
  it("parset /grok", () => {
    assert.equal(parseGrokCommand("/grok doe iets"), "doe iets");
    assert.equal(parseGrokCommand("/GROK  hoi"), "hoi");
    assert.equal(parseGrokCommand("/grokken"), null);
    assert.equal(parseGrokCommand("hallo"), null);
  });
  it("header modes", () => {
    assert.deepEqual(authHeader("bearer", "", "k"), ["Authorization", "Bearer k"]);
    assert.deepEqual(authHeader("custom", "X-Sender-Key", "k"), ["X-Sender-Key", "k"]);
    assert.throws(() => authHeader("custom", "bad header", "k"));
  });
  it("maskeert en valideert", () => {
    assert.equal(maskKey("abcdef123"), "••••f123");
    assert.equal(maskKey(""), "");
    assert.ok(validWebhookUrl("https://x.y/hook"));
    assert.ok(!validWebhookUrl("ftp://x"));
  });
});
