// Namespace-import: node:crypto wordt pas bij aanroep gebruikt (server), zodat de client-bundel niet breekt.
import * as nc from "node:crypto";

/** Mailverbinding: pure helpers (MIME, versleuteling, providerinstellingen). Geen netwerk hier. */

export * from "./mail-shared.ts";

export const OUTLOOK_SCOPE = "offline_access Mail.Send User.Read";
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export interface Attachment { filename: string; contentType: string; data: Uint8Array }
export interface OutgoingMail {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  body: string;
  attachments?: Attachment[];
}



function b64(data: Uint8Array | string): string {
  return Buffer.from(data).toString("base64");
}

function wrap76(s: string): string {
  return s.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

/** RFC 2047 voor niet-ASCII onderwerpen/namen. */
export function encodeHeader(v: string): string {
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`;
}

/** Bouwt een volledige RFC 5322 MIME-boodschap (voor Gmail raw, SMTP-test en .eml-download). */
export function buildMime(m: OutgoingMail, opts: { boundary?: string; date?: Date; messageId?: string } = {}): string {
  const boundary = opts.boundary ?? `kade-${nc.randomBytes(8).toString("hex")}`;
  const from = m.fromName ? `${encodeHeader(m.fromName)} <${m.from}>` : m.from;
  const head = [
    `From: ${from}`,
    `To: ${m.to}`,
    `Subject: ${encodeHeader(m.subject)}`,
    `Date: ${(opts.date ?? new Date()).toUTCString()}`,
    ...(opts.messageId ? [`Message-ID: ${opts.messageId}`] : []),
    "MIME-Version: 1.0",
  ];
  const text = ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(b64(m.body))].join("\r\n");
  if (!m.attachments?.length) return [...head, text].join("\r\n") + "\r\n";
  const parts = [text, ...m.attachments.map((a) => [
    `Content-Type: ${a.contentType}; name="${a.filename}"`,
    `Content-Disposition: attachment; filename="${a.filename}"`,
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64(a.data)),
  ].join("\r\n"))];
  return [...head, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts.map((p) => `--${boundary}\r\n${p}`), `--${boundary}--`, ""].join("\r\n");
}

export function base64url(s: string | Uint8Array): string {
  return Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Microsoft Graph /me/sendMail-body. */
export function graphPayload(m: OutgoingMail) {
  return {
    message: {
      subject: m.subject,
      body: { contentType: "Text", content: m.body },
      toRecipients: [{ emailAddress: { address: m.to } }],
      attachments: (m.attachments ?? []).map((a) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: a.filename,
        contentType: a.contentType,
        contentBytes: b64(a.data),
      })),
    },
    saveToSentItems: true,
  };
}

/** mailto-link (zonder bijlage: mailto kan geen bijlagen dragen). */

function keyFrom(secret: string): Buffer {
  return nc.createHash("sha256").update(secret).digest();
}

/** AES-256-GCM; sleutel komt uit env MAIL_TOKEN_KEY. Formaat: v1.iv.tag.data (base64url). */
export function encryptSecret(plain: string, secret: string): string {
  if (!secret) throw new Error("MAIL_TOKEN_KEY ontbreekt.");
  const iv = nc.randomBytes(12);
  const c = nc.createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", base64url(iv), base64url(c.getAuthTag()), base64url(data)].join(".");
}

export function decryptSecret(enc: string, secret: string): string {
  const [v, iv, tag, data] = enc.split(".");
  if (v !== "v1" || !iv || !tag || data === undefined) throw new Error("Onbekend tokenformaat.");
  const from = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const d = nc.createDecipheriv("aes-256-gcm", keyFrom(secret), from(iv));
  d.setAuthTag(from(tag));
  return Buffer.concat([d.update(from(data)), d.final()]).toString("utf8");
}

export function outlookAuthorizeUrl(o: { tenant: string; clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({ client_id: o.clientId, response_type: "code", redirect_uri: o.redirectUri, response_mode: "query", scope: OUTLOOK_SCOPE, state: o.state, prompt: "select_account" });
  return `https://login.microsoftonline.com/${encodeURIComponent(o.tenant || "common")}/oauth2/v2.0/authorize?${q}`;
}

export function gmailAuthorizeUrl(o: { clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({ client_id: o.clientId, response_type: "code", redirect_uri: o.redirectUri, scope: GMAIL_SCOPE, state: o.state, access_type: "offline", prompt: "consent", include_granted_scopes: "true" });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export function safeFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "document";
}
