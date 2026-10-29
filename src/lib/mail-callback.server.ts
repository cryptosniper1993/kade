import { db, str } from "@/lib/ops-shared";
import { exchangeCode, sealTokens } from "@/lib/mail.server";
import { audit } from "@/lib/ops-jam";

/** OAuth-terugkeer voor Outlook/Gmail. De state koppelt de callback aan de gebruiker die op Verbinden klikte. */
export async function handleMailCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const back = (msg: string) => new Response(null, { status: 302, headers: { location: `/?mail=${encodeURIComponent(msg)}#instellingen` } });
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (url.searchParams.get("error")) return back(`geweigerd: ${str(url.searchParams.get("error_description") ?? url.searchParams.get("error"), 120)}`);
  if (!state || !code || state.length > 100) return back("ongeldige terugkeer");
  const sql = await db();
  const row = (await sql<Record<string, unknown>>`select user_id, provider from mail_settings where oauth_state = ${state}`)[0];
  if (!row) return back("onbekende of verlopen state");
  const provider = String(row.provider);
  if (provider !== "outlook" && provider !== "gmail") return back("provider gewijzigd");
  try {
    const tokens = await exchangeCode(provider, code);
    await sql`update mail_settings set token_enc = ${sealTokens(tokens)}, token_account = ${provider}, oauth_state = '' where user_id = ${String(row.user_id)}`;
    await audit(sql, String(row.user_id), "kobe", "mail.connect", "mail", "", provider);
    return back("verbonden");
  } catch (e) {
    await sql`update mail_settings set oauth_state = '' where user_id = ${String(row.user_id)}`;
    return back(e instanceof Error ? e.message.slice(0, 120) : "mislukt");
  }
}
