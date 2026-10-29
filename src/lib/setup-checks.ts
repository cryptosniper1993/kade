/** Setup-checklist: pure beoordeling, testbaar zonder server. */
export type CheckState = "ok" | "ontbreekt" | "optioneel";
export interface SetupCheck { id: string; title: string; state: CheckState; detail: string; target: string; required: boolean }

/** Env-variabelen die #setup toont (enkel of ze gezet zijn, nooit de waarde). */
export const SETUP_ENV: { name: string; group: string; required: boolean; note: string }[] = [
  { name: "DATABASE_URL", group: "Database", required: true, note: "Neon pooled URL (eu-central-1), ?sslmode=require" },
  { name: "DATABASE_URL_UNPOOLED", group: "Database", required: false, note: "Neon direct URL voor migraties" },
  { name: "XAI_API_KEY", group: "AI", required: false, note: "Loots, Schaar, research" },
  { name: "VITE_AUTH_ENABLED", group: "Auth", required: true, note: "true in productie" },
  { name: "BETTER_AUTH_SECRET", group: "Auth", required: true, note: "lange willekeurige string" },
  { name: "BETTER_AUTH_URL", group: "Auth", required: true, note: "https://kade.jouwdomein.be" },
  { name: "APP_URL", group: "Mail", required: false, note: "publieke URL voor OAuth-redirect" },
  { name: "MAIL_TOKEN_KEY", group: "Mail", required: false, note: "versleutelt OAuth-tokens" },
  { name: "MS_CLIENT_ID", group: "Mail", required: false, note: "Azure app (Outlook)" },
  { name: "MS_CLIENT_SECRET", group: "Mail", required: false, note: "Azure app (Outlook)" },
  { name: "MS_TENANT", group: "Mail", required: false, note: "tenant-id of common" },
  { name: "GOOGLE_CLIENT_ID", group: "Mail", required: false, note: "Google Cloud (Gmail)" },
  { name: "GOOGLE_CLIENT_SECRET", group: "Mail", required: false, note: "Google Cloud (Gmail)" },
  { name: "SMTP_PASSWORD", group: "Mail", required: false, note: "enkel bij SMTP" },
  { name: "PEPPOL_PROVIDER", group: "Peppol", required: false, note: "accesspoint-provider" },
  { name: "PEPPOL_API_URL", group: "Peppol", required: false, note: "" },
  { name: "PEPPOL_API_KEY", group: "Peppol", required: false, note: "" },
];

export function progress(checks: SetupCheck[]): { done: number; total: number; pct: number } {
  const counted = checks.filter((c) => c.required || c.state === "ok");
  const done = counted.filter((c) => c.state === "ok").length;
  return { done, total: counted.length, pct: counted.length ? Math.round((done / counted.length) * 100) : 100 };
}

export function state(ok: boolean, required: boolean): CheckState {
  return ok ? "ok" : required ? "ontbreekt" : "optioneel";
}
