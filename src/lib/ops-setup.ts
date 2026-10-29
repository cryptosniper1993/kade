import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { db, mapCompany } from "@/lib/ops-shared";
import { env } from "@/lib/env.server";
import { dbSource } from "@/lib/db";
import { readMailRow } from "@/lib/ops-mail";
import { socialStatus } from "@/lib/ops-social";
import { readOutreachSettings } from "@/lib/ops-jam";
import { MAIL_ENV } from "@/lib/mail";
import { grokHealth, grokState } from "@/lib/grok-client";
import { SETUP_ENV, state, type SetupCheck } from "@/lib/setup-checks";

/** Alles wat #setup toont. Env: enkel aanwezig/afwezig, nooit waarden. */
export const loadSetup = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const u = context.userId;
    const has = (k: string) => Boolean(env(k));
    const envs = SETUP_ENV.map((e) => ({ ...e, set: has(e.name) || (e.name === "DATABASE_URL" && has("NETLIFY_DATABASE_URL")) }));
    const company = mapCompany((await sql<Record<string, unknown>>`select * from companies where user_id = ${u}`)[0]);
    const desk = (await sql<Record<string, unknown>>`select * from desk_settings where user_id = ${u}`)[0];
    const settings = await readOutreachSettings(sql, u);
    const mail = await readMailRow(sql, u);
    const bots = await sql<{ n: number; withUrl: number }>`select count(*)::int as n, count(*) filter (where webhook_url <> '')::int as "withUrl" from grok_bots where user_id = ${u}`;
    let dbHost = "";
    try { const raw = env("DATABASE_URL") ?? env("NETLIFY_DATABASE_URL"); dbHost = raw ? new URL(raw).hostname.replace(/^[^.]+/, "…") : ""; } catch { dbHost = ""; }
    const authOn = (env("VITE_AUTH_ENABLED") ?? process.env.VITE_AUTH_ENABLED) !== "false";
    const companyOk = Boolean(company?.name && company.address && company.enterpriseNumber && company.iban);
    const mailOk = mail.provider === "mailto" ? Boolean(mail.fromAddress) : mail.provider === "smtp" ? Boolean(mail.smtpHost && mail.fromAddress) : Boolean(mail.tokenEnc);
    const gh = grokHealth();
    const gs = grokState(gh);
    const ob = (await sql<{ n: number }>`select count(*)::int as n from grokbot_outbox where user_id = ${u} and status = 'wachtrij'`)[0]?.n ?? 0;
    const soc = await socialStatus(sql, u).catch(() => []);
    const socOn = soc.filter((x) => x.connected).map((x) => x.platform);
    const checks: SetupCheck[] = [
      { id: "social", title: "Socials (Facebook, Instagram, TikTok)", required: false, state: state(socOn.length > 0, false), target: "social",
        detail: socOn.length ? `Verbonden: ${socOn.join(", ")}.` : "Niet verbonden. Meta- en TikTok-app nodig, zie handleiding Social." },
      { id: "grok", title: "Grok (AI) en Grok Bots", required: false, state: gs === "ok" ? "ok" : gs === "storing" ? "ontbreekt" : "optioneel", target: "grokbots",
        detail: `${gs === "uit" ? "Geen XAI_API_KEY: AI-functies uit, de rest werkt." : gs === "storing" ? `Storing sinds ${new Date(gh.lastFailAt!).toLocaleString("nl-BE", { timeZone: "Europe/Brussels" })} (${gh.lastError}).` : gs === "ok" ? "Laatste AI-oproep geslaagd." : "Nog geen AI-oproep sinds de start."} Wachtrij Grok Bots: ${ob}.` },
      { id: "zaak", title: "Zaakfiche", required: true, state: state(companyOk, true), target: "zaak",
        detail: company ? `${company.legalForm} · ${company.activityStatus} · ${company.vatRegime === "exempt" ? "vrijgesteld (art. 56bis)" : `btw ${company.vatRegime}`}${companyOk ? "" : " · adres, KBO of IBAN ontbreekt"}` : "Nog geen zaakfiche." },
      { id: "drempel", title: "Vrijstellingsdrempel", required: company?.vatRegime === "exempt", state: state(Boolean(settings.activityStart), company?.vatRegime === "exempt"), target: "instellingen",
        detail: `Drempel € ${settings.exemptionThreshold.toLocaleString("nl-BE")}${settings.activityStart ? ` · start ${settings.activityStart}` : " · startdatum activiteit ontbreekt"}` },
      { id: "facturen", title: "Facturen en offertes", required: true, state: state(Boolean(company?.iban), true), target: "facturen", detail: company?.iban ? "IBAN staat op de zaakfiche; nummering en layout in Facturen/Offertes." : "IBAN nodig op de factuur." },
      { id: "peppol", title: "Peppol-provider", required: false, state: state(has("PEPPOL_PROVIDER") && has("PEPPOL_API_URL") && has("PEPPOL_API_KEY"), false), target: "instellingen", detail: has("PEPPOL_PROVIDER") ? "Provider ingesteld via env." : "Nog geen accesspoint (verplicht voor B2B vanaf 2026 indien btw-plichtig)." },
      { id: "mail", title: "Mailverbinding", required: true, state: state(mailOk, true), target: "instellingen",
        detail: `${mail.provider}${mail.fromAddress ? ` · ${mail.fromAddress}` : " · afzender ontbreekt"}${MAIL_ENV[mail.provider].filter((k) => !has(k)).length ? ` · env ontbreekt: ${MAIL_ENV[mail.provider].filter((k) => !has(k)).join(", ")}` : ""}` },
      { id: "database", title: "Database (Neon)", required: true, state: state(dbSource === "neon", true), target: "", detail: dbSource === "neon" ? `Postgres via DATABASE_URL (${dbHost || "host verborgen"})` : "Lokale PGlite: enkel voor ontwikkeling. Zet DATABASE_URL (Neon, Frankfurt)." },
      { id: "env", title: "Netlify / env", required: true, state: state(envs.filter((e) => e.required).every((e) => e.set), true), target: "", detail: `${envs.filter((e) => e.set).length}/${envs.length} variabelen gezet` },
      { id: "auth", title: "Aanmelden", required: true, state: state(authOn && has("BETTER_AUTH_SECRET"), true), target: "", detail: authOn ? (has("BETTER_AUTH_SECRET") ? "Aan." : "Aan, maar BETTER_AUTH_SECRET ontbreekt.") : "Uit (VITE_AUTH_ENABLED=false): enkel lokaal gebruiken." },
      { id: "grokbots", title: "GROK BOTS", required: false, state: state((bots[0]?.withUrl ?? 0) > 0, false), target: "grokbots", detail: `${bots[0]?.n ?? 0} bot(s), ${bots[0]?.withUrl ?? 0} met webhook` },
      { id: "branding", title: "Branding", required: false, state: state(desk?.theme === "justaminute", false), target: "instellingen", detail: desk?.theme === "justaminute" ? "JustAMinute (navy #104176, coral #E33737)" : "Standaard KADE-thema" },
      { id: "naam", title: "Interface en hoofdstem", required: false, state: state(Boolean(desk?.brand && desk.brand !== "KADE"), false), target: "instellingen", detail: `Naam: ${String(desk?.brand ?? "KADE")}` },
      { id: "verzendregels", title: "Verzendregels en verboden namen", required: true, state: state(settings.forbiddenNames.length > 0, true), target: "instellingen", detail: `${settings.maxPerDay}/dag · ${settings.windowFrom}-${settings.windowUntil} · ${settings.forbiddenNames.length} verboden naam/namen` },
    ];
    return { grok: { state: gs, ...gh, outbox: ob }, checks, envs: envs.map(({ name, group, required, note, set }) => ({ name, group, required, note, set })), dbSource };
  });
