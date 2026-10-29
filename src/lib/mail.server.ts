import { env } from "./env.server.ts";
import { base64url, buildMime, decryptSecret, encryptSecret, graphPayload, type MailProvider, type OutgoingMail } from "./mail.ts";

/**
 * Transport per provider. `fetchImpl` en `smtpImpl` zijn injecteerbaar zodat tests nooit echte mail versturen.
 */
export interface MailRow {
  provider: MailProvider;
  fromAddress: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpSecure: boolean;
  tokenEnc: string;
}

export interface Tokens { refresh_token: string; access_token?: string; expires_at?: number }

export interface TransportDeps {
  fetchImpl?: typeof fetch;
  smtpImpl?: (cfg: { host: string; port: number; secure: boolean; user: string; pass: string }, raw: string, env: { from: string; to: string }) => Promise<void>;
  onTokens?: (enc: string) => Promise<void>;
}

export class MailError extends Error {}

function tokenKey(): string {
  const k = env("MAIL_TOKEN_KEY");
  if (!k) throw new MailError("MAIL_TOKEN_KEY ontbreekt op de server.");
  return k;
}

export function sealTokens(t: Tokens): string {
  return encryptSecret(JSON.stringify(t), tokenKey());
}

export function openTokens(enc: string): Tokens {
  if (!enc) throw new MailError("Nog niet verbonden. Klik eerst op Verbinden.");
  return JSON.parse(decryptSecret(enc, tokenKey())) as Tokens;
}

export function redirectUri(): string {
  const base = (env("APP_URL") ?? env("URL") ?? "http://localhost:8080").replace(/\/$/, "");
  return `${base}/api/mail/callback`;
}

async function tokenRequest(provider: "outlook" | "gmail", body: Record<string, string>, f: typeof fetch): Promise<Tokens & { email?: string }> {
  const url = provider === "outlook"
    ? `https://login.microsoftonline.com/${encodeURIComponent(env("MS_TENANT") ?? "common")}/oauth2/v2.0/token`
    : "https://oauth2.googleapis.com/token";
  const creds = provider === "outlook"
    ? { client_id: env("MS_CLIENT_ID") ?? "", client_secret: env("MS_CLIENT_SECRET") ?? "" }
    : { client_id: env("GOOGLE_CLIENT_ID") ?? "", client_secret: env("GOOGLE_CLIENT_SECRET") ?? "" };
  if (!creds.client_id || !creds.client_secret) throw new MailError(`OAuth-app voor ${provider} is niet ingesteld (env).`);
  const res = await f(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...creds, ...body }) });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof j.access_token !== "string") throw new MailError(`Token geweigerd (${res.status}): ${String(j.error_description ?? j.error ?? "onbekend").slice(0, 200)}`);
  return {
    access_token: j.access_token,
    refresh_token: typeof j.refresh_token === "string" ? j.refresh_token : body.refresh_token ?? "",
    expires_at: Date.now() + (Number(j.expires_in) || 3000) * 1000 - 60_000,
  };
}

export async function exchangeCode(provider: "outlook" | "gmail", code: string, f: typeof fetch = fetch): Promise<Tokens> {
  const scope: Record<string, string> = provider === "outlook" ? { scope: "offline_access Mail.Send User.Read" } : {};
  return tokenRequest(provider, { grant_type: "authorization_code", code, redirect_uri: redirectUri(), ...scope }, f);
}

async function accessToken(row: MailRow, deps: TransportDeps): Promise<string> {
  const f = deps.fetchImpl ?? fetch;
  const t = openTokens(row.tokenEnc);
  if (t.access_token && t.expires_at && t.expires_at > Date.now()) return t.access_token;
  if (!t.refresh_token) throw new MailError("Verbinding verlopen. Verbind opnieuw.");
  const fresh = await tokenRequest(row.provider as "outlook" | "gmail", { grant_type: "refresh_token", refresh_token: t.refresh_token }, f);
  await deps.onTokens?.(sealTokens(fresh));
  return fresh.access_token!;
}

export async function sendVia(row: MailRow, mail: OutgoingMail, deps: TransportDeps = {}): Promise<string> {
  const f = deps.fetchImpl ?? fetch;
  if (row.provider === "mailto") throw new MailError("Mailprogramma-modus: gebruik 'Open in mailprogramma' of download de .eml.");
  if (row.provider === "outlook") {
    const token = await accessToken(row, deps);
    const res = await f("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(graphPayload(mail)),
    });
    if (res.status !== 202) throw new MailError(`Graph weigerde (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return "Verzonden via Microsoft Graph.";
  }
  if (row.provider === "gmail") {
    const token = await accessToken(row, deps);
    const res = await f("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ raw: base64url(buildMime(mail)) }),
    });
    if (!res.ok) throw new MailError(`Gmail weigerde (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return "Verzonden via Gmail.";
  }
  const pass = env("SMTP_PASSWORD") ?? "";
  if (!row.smtpHost) throw new MailError("SMTP-server ontbreekt.");
  const cfg = { host: row.smtpHost, port: row.smtpPort, secure: row.smtpSecure, user: row.smtpUser, pass };
  const raw = buildMime(mail);
  if (deps.smtpImpl) await deps.smtpImpl(cfg, raw, { from: mail.from, to: mail.to });
  else {
    const nodemailer = await import("nodemailer");
    const t = nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined });
    await t.sendMail({ envelope: { from: mail.from, to: mail.to }, raw });
  }
  return "Verzonden via SMTP.";
}

/** Test zonder mail te versturen: token vernieuwen/profiel lezen, of SMTP verify. */
export async function testVia(row: MailRow, deps: TransportDeps = {}): Promise<string> {
  const f = deps.fetchImpl ?? fetch;
  if (row.provider === "mailto") return "Mailprogramma-modus: niets te testen, je mailprogramma verstuurt.";
  if (row.provider === "outlook" || row.provider === "gmail") {
    const token = await accessToken(row, deps);
    const url = row.provider === "outlook" ? "https://graph.microsoft.com/v1.0/me" : "https://gmail.googleapis.com/gmail/v1/users/me/profile";
    const res = await f(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) {
      if (row.provider === "gmail" && res.status === 403) return "Token geldig (gmail.send geeft geen leesrechten op het profiel; dat is normaal).";
      throw new MailError(`Test mislukt (${res.status}).`);
    }
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return `Verbonden als ${String(j.mail ?? j.userPrincipalName ?? j.emailAddress ?? "onbekend")}.`;
  }
  if (!row.smtpHost) throw new MailError("SMTP-server ontbreekt.");
  if (deps.smtpImpl) return "SMTP-test (gesimuleerd) geslaagd.";
  const nodemailer = await import("nodemailer");
  const t = nodemailer.createTransport({ host: row.smtpHost, port: row.smtpPort, secure: row.smtpSecure, auth: row.smtpUser ? { user: row.smtpUser, pass: env("SMTP_PASSWORD") ?? "" } : undefined });
  await t.verify();
  return `SMTP ${row.smtpHost}:${row.smtpPort} antwoordt.`;
}
