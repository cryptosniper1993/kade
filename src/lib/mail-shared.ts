/** Mailverbinding: client-veilige constanten (geen node-modules). */

export const MAIL_PROVIDERS = ["mailto", "outlook", "gmail", "smtp"] as const;
export type MailProvider = (typeof MAIL_PROVIDERS)[number];

export const MAIL_PROVIDER_LABEL: Record<MailProvider, string> = {
  mailto: "Mailprogramma (mailto / .eml)",
  outlook: "Microsoft 365 / Outlook (Graph)",
  gmail: "Gmail (OAuth)",
  smtp: "SMTP-server",
};

/** Welke env-variabelen elke provider nodig heeft (namen, nooit waarden). */
export const MAIL_ENV: Record<MailProvider, string[]> = {
  mailto: [],
  outlook: ["MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_TENANT", "MAIL_TOKEN_KEY", "APP_URL"],
  gmail: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "MAIL_TOKEN_KEY", "APP_URL"],
  smtp: ["SMTP_PASSWORD"],
};


export function isProvider(v: unknown): v is MailProvider {
  return typeof v === "string" && (MAIL_PROVIDERS as readonly string[]).includes(v);
}

export function validEmail(v: string): boolean {
  return /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(v.trim());
}

export function mailtoLink(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
