import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMime, decryptSecret, encryptSecret, graphPayload, gmailAuthorizeUrl, mailtoLink, outlookAuthorizeUrl, validEmail, encodeHeader, MAIL_ENV } from "./mail.ts";

const att = { filename: "factuur-2026-001.pdf", contentType: "application/pdf", data: new TextEncoder().encode("%PDF-1.7 test") };

test("mime zonder en met bijlage", () => {
  const plain = buildMime({ from: "a@x.be", to: "b@y.be", subject: "Hallo", body: "Tekst" }, { date: new Date(0) });
  assert.match(plain, /^From: a@x\.be\r\nTo: b@y\.be\r\nSubject: Hallo/);
  assert.ok(!plain.includes("multipart"));
  const mixed = buildMime({ from: "a@x.be", fromName: "Kobé", to: "b@y.be", subject: "Factuur é", body: "Zie bijlage", attachments: [att] }, { boundary: "BND" });
  assert.ok(mixed.includes('multipart/mixed; boundary="BND"'));
  assert.ok(mixed.includes('filename="factuur-2026-001.pdf"'));
  assert.ok(mixed.includes(Buffer.from("%PDF-1.7 test").toString("base64")));
  assert.ok(mixed.includes("--BND--"));
  assert.ok(mixed.includes("=?UTF-8?B?"));
  assert.equal(encodeHeader("plain"), "plain");
});

test("graph payload draagt bijlage als base64", () => {
  const p = graphPayload({ from: "a@x.be", to: "b@y.be", subject: "S", body: "B", attachments: [att] });
  assert.equal(p.message.toRecipients[0].emailAddress.address, "b@y.be");
  assert.equal(p.message.attachments[0]["@odata.type"], "#microsoft.graph.fileAttachment");
  assert.equal(Buffer.from(p.message.attachments[0].contentBytes, "base64").toString(), "%PDF-1.7 test");
});

test("tokens versleuteld en niet leesbaar zonder sleutel", () => {
  const enc = encryptSecret('{"refresh_token":"geheim"}', "sleutel-1");
  assert.ok(!enc.includes("geheim"));
  assert.equal(decryptSecret(enc, "sleutel-1"), '{"refresh_token":"geheim"}');
  assert.throws(() => decryptSecret(enc, "andere-sleutel"));
  assert.throws(() => encryptSecret("x", ""));
});

test("oauth-urls met juiste scopes", () => {
  const o = new URL(outlookAuthorizeUrl({ tenant: "common", clientId: "cid", redirectUri: "https://k.example/api/mail/callback", state: "s1" }));
  assert.equal(o.host, "login.microsoftonline.com");
  assert.ok(o.searchParams.get("scope")!.includes("Mail.Send"));
  assert.ok(o.searchParams.get("scope")!.includes("offline_access"));
  const g = new URL(gmailAuthorizeUrl({ clientId: "cid", redirectUri: "https://k.example/api/mail/callback", state: "s2" }));
  assert.equal(g.searchParams.get("scope"), "https://www.googleapis.com/auth/gmail.send");
  assert.equal(g.searchParams.get("access_type"), "offline");
});

test("mailto en adrescontrole", () => {
  assert.ok(mailtoLink("a@b.be", "Onder werp", "x&y").startsWith("mailto:a%40b.be?subject=Onder%20werp&body=x%26y"));
  assert.ok(validEmail("kobe@justaminute.be"));
  assert.ok(!validEmail("kobe@"));
  assert.deepEqual(MAIL_ENV.outlook.slice(0, 3), ["MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_TENANT"]);
});
