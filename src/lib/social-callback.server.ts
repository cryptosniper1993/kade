import { db, str } from "@/lib/ops-shared";
import { audit } from "@/lib/ops-jam";
import { metaConnect, seal, tiktokConnect } from "@/lib/social.server";

/** OAuth-terugkeer voor Meta (Facebook + Instagram) en TikTok. */
export async function handleSocialCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const back = (m: string) => new Response(null, { status: 302, headers: { location: `/?social=${encodeURIComponent(m)}#social` } });
  const p = url.searchParams.get("p") === "tiktok" ? "tiktok" : "meta";
  const state = url.searchParams.get("state") ?? "", code = url.searchParams.get("code") ?? "";
  if (url.searchParams.get("error")) return back(`geweigerd: ${str(url.searchParams.get("error_description") ?? url.searchParams.get("error"), 120)}`);
  if (!state || !code || state.length > 100) return back("ongeldige terugkeer");
  const sql = await db();
  const row = (await sql<Record<string, unknown>>`select user_id from social_accounts where oauth_state = ${state} and platform = ${p === "tiktok" ? "tiktok" : "facebook"}`)[0];
  if (!row) return back("onbekende of verlopen state");
  const u = String(row.user_id);
  try {
    const accts = p === "tiktok" ? [await tiktokConnect(code)] : await metaConnect(code);
    for (const a of accts) {
      const tok = "refresh" in a ? { token: a.token, refresh: a.refresh } : { token: a.token };
      const exp = "expiresIn" in a ? new Date(Date.now() + Number(a.expiresIn) * 1000).toISOString() : null;
      await sql`insert into social_accounts (user_id, platform, account_id, account_name, token_enc, expires_at, oauth_state, connected_at)
        values (${u}, ${a.platform}, ${a.accountId}, ${a.accountName}, ${seal(JSON.stringify(tok))}, ${exp}, '', now())
        on conflict (user_id, platform) do update set account_id = excluded.account_id, account_name = excluded.account_name, token_enc = excluded.token_enc, expires_at = excluded.expires_at, oauth_state = '', connected_at = now()`;
      await audit(sql, u, "kobe", "social.connect", "social", "", a.platform);
    }
    return back(`verbonden: ${accts.map((a) => a.platform).join(", ")}`);
  } catch (e) {
    await sql`update social_accounts set oauth_state = '' where user_id = ${u} and oauth_state = ${state}`;
    return back(e instanceof Error ? e.message.slice(0, 120) : "mislukt");
  }
}
