import { test } from "node:test";
import assert from "node:assert/strict";
import { sendVia, testVia, sealTokens, type MailRow } from "./mail.server.ts";

process.env.MAIL_TOKEN_KEY = "test-sleutel";
process.env.MS_CLIENT_ID = "cid"; process.env.MS_CLIENT_SECRET = "sec"; process.env.MS_TENANT = "common";
const mail = { from: "k@x.be", to: "klant@y.be", subject: "Offerte", body: "Zie bijlage", attachments: [{ filename: "o.pdf", contentType: "application/pdf", data: new Uint8Array([1, 2]) }] };
const base: MailRow = { provider: "outlook", fromAddress: "k@x.be", fromName: "", smtpHost: "", smtpPort: 587, smtpUser: "", smtpSecure: false, tokenEnc: "" };

function fakeFetch(calls: { url: string; init?: RequestInit }[], status = 202) {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/token")) return new Response(JSON.stringify({ access_token: "AT2", refresh_token: "RT2", expires_in: 3600 }), { status: 200 });
    return new Response("", { status });
  }) as unknown as typeof fetch;
}

test("outlook: vernieuwt token en post naar Graph sendMail (gemockt)", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  let saved = "";
  const row = { ...base, tokenEnc: sealTokens({ refresh_token: "RT1" }) };
  const msg = await sendVia(row, mail, { fetchImpl: fakeFetch(calls), onTokens: async (e) => { saved = e; } });
  assert.equal(msg, "Verzonden via Microsoft Graph.");
  assert.ok(calls[0].url.includes("login.microsoftonline.com/common/oauth2/v2.0/token"));
  assert.equal(calls[1].url, "https://graph.microsoft.com/v1.0/me/sendMail");
  assert.ok(String(calls[1].init?.body).includes('"name":"o.pdf"'));
  assert.ok(saved && !saved.includes("AT2"));
});

test("gmail: raw mime naar messages/send", async () => {
  process.env.GOOGLE_CLIENT_ID = "g"; process.env.GOOGLE_CLIENT_SECRET = "s";
  const calls: { url: string; init?: RequestInit }[] = [];
  const row = { ...base, provider: "gmail" as const, tokenEnc: sealTokens({ refresh_token: "R", access_token: "A", expires_at: Date.now() + 600_000 }) };
  await sendVia(row, mail, { fetchImpl: fakeFetch(calls, 200) });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/gmail/v1/users/me/messages/send"));
  const raw = JSON.parse(String(calls[0].init?.body)).raw as string;
  assert.ok(Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString().includes("To: klant@y.be"));
});

test("smtp en mailto: geen echte verzending", async () => {
  let sent = "";
  await sendVia({ ...base, provider: "smtp", smtpHost: "smtp.test.invalid" }, mail, { smtpImpl: async (_c, raw) => { sent = raw; } });
  assert.ok(sent.includes("Subject: Offerte"));
  await assert.rejects(sendVia({ ...base, provider: "mailto" }, mail), /Mailprogramma/);
  await assert.rejects(sendVia({ ...base, provider: "outlook" }, mail), /Nog niet verbonden/);
  assert.match(await testVia({ ...base, provider: "smtp", smtpHost: "h" }, { smtpImpl: async () => {} }), /gesimuleerd/);
});

test("graph-fout wordt gemeld", async () => {
  const row = { ...base, tokenEnc: sealTokens({ refresh_token: "R", access_token: "A", expires_at: Date.now() + 600_000 }) };
  await assert.rejects(sendVia(row, mail, { fetchImpl: fakeFetch([], 401) }), /Graph weigerde \(401\)/);
});
