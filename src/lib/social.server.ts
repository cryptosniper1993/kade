import { env } from "./env.server.ts";
import { decryptSecret, encryptSecret } from "./mail.ts";
import { GRAPH, facebookRequest, instagramContainer, pickPrivacy, tiktokInit, type Draft, type SocialPlatform } from "./social.ts";

/** Netwerk naar Meta Graph en TikTok. fetch is injecteerbaar zodat tests nooit echt posten. */
export class SocialError extends Error {}
type F = typeof fetch;
export interface Account { platform: SocialPlatform; accountId: string; accountName: string; token: string }
const TT = "https://open.tiktokapis.com";

function key(): string {
  const k = env("SOCIAL_TOKEN_KEY") ?? env("MAIL_TOKEN_KEY");
  if (!k) throw new SocialError("SOCIAL_TOKEN_KEY (of MAIL_TOKEN_KEY) ontbreekt op de server.");
  return k;
}
export const seal = (s: string) => encryptSecret(s, key());
export const unseal = (s: string) => decryptSecret(s, key());
export function socialRedirect(p: "meta" | "tiktok"): string {
  const base = (env("APP_URL") ?? env("URL") ?? "http://localhost:8080").replace(/\/$/, "");
  return `${base}/api/social/callback?p=${p}`;
}

async function j(r: Response): Promise<Record<string, any>> {
  const b = (await r.json().catch(() => ({}))) as Record<string, any>;
  const err = b.error && (b.error.message || (b.error.code && b.error.code !== "ok" ? b.error.code : ""));
  if (!r.ok || err) throw new SocialError(String(err || `HTTP ${r.status}`).slice(0, 200));
  return b;
}
const timeout = () => AbortSignal.timeout(20000);

/** Meta: code → langlevend user-token → pagina's (+ gekoppeld Instagram-account). */
export async function metaConnect(code: string, f: F = fetch): Promise<Account[]> {
  const id = env("META_APP_ID") ?? "", secret = env("META_APP_SECRET") ?? "";
  if (!id || !secret) throw new SocialError("META_APP_ID/META_APP_SECRET ontbreken.");
  const short = await j(await f(`${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: id, client_secret: secret, redirect_uri: socialRedirect("meta"), code })}`, { signal: timeout() }));
  const long = await j(await f(`${GRAPH}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: String(short.access_token) })}`, { signal: timeout() }));
  const pages = await j(await f(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(String(long.access_token))}`, { signal: timeout() }));
  const page = (pages.data ?? [])[0];
  if (!page) throw new SocialError("Geen Facebook-pagina gevonden waarvoor je beheerder bent.");
  const out: Account[] = [{ platform: "facebook", accountId: String(page.id), accountName: String(page.name), token: String(page.access_token) }];
  const ig = page.instagram_business_account;
  if (ig?.id) out.push({ platform: "instagram", accountId: String(ig.id), accountName: String(ig.username ?? ""), token: String(page.access_token) });
  return out;
}

export async function tiktokConnect(code: string, f: F = fetch): Promise<Account & { refresh: string; expiresIn: number }> {
  const ck = env("TIKTOK_CLIENT_KEY") ?? "", cs = env("TIKTOK_CLIENT_SECRET") ?? "";
  if (!ck || !cs) throw new SocialError("TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET ontbreken.");
  const t = await j(await f(`${TT}/v2/oauth/token/`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_key: ck, client_secret: cs, code, grant_type: "authorization_code", redirect_uri: socialRedirect("tiktok") }), signal: timeout() }));
  const u = await j(await f(`${TT}/v2/user/info/?fields=open_id,display_name`, { headers: { authorization: `Bearer ${t.access_token}` }, signal: timeout() }));
  return { platform: "tiktok", accountId: String(t.open_id), accountName: String(u.data?.user?.display_name ?? ""), token: String(t.access_token), refresh: String(t.refresh_token ?? ""), expiresIn: Number(t.expires_in ?? 86400) };
}

/** Publiceert één concept op één platform. Geeft een post-id of publish-id terug. */
export async function publishTo(a: Account, d: Draft, f: F = fetch, opts: { tiktokPublic?: boolean } = {}): Promise<string> {
  if (a.platform === "facebook") {
    const r = facebookRequest(a.accountId, d);
    const b = await j(await f(`${GRAPH}${r.path}`, { method: "POST", body: new URLSearchParams({ ...r.params, access_token: a.token }), signal: timeout() }));
    return String(b.post_id ?? b.id);
  }
  if (a.platform === "instagram") {
    const c = await j(await f(`${GRAPH}/${a.accountId}/media`, { method: "POST", body: new URLSearchParams({ ...instagramContainer(d), access_token: a.token }), signal: timeout() }));
    if (d.mediaType === "video") {
      for (let i = 0; i < 10; i++) {
        const s = await j(await f(`${GRAPH}/${c.id}?fields=status_code&access_token=${encodeURIComponent(a.token)}`, { signal: timeout() }));
        if (s.status_code === "FINISHED") break;
        if (s.status_code === "ERROR") throw new SocialError("Instagram kon de video niet verwerken.");
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    const p = await j(await f(`${GRAPH}/${a.accountId}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: String(c.id), access_token: a.token }), signal: timeout() }));
    return String(p.id);
  }
  const h = { authorization: `Bearer ${a.token}`, "content-type": "application/json; charset=UTF-8" };
  const info = await j(await f(`${TT}/v2/post/publish/creator_info/query/`, { method: "POST", headers: h, signal: timeout() }));
  const req = tiktokInit(d, pickPrivacy(info.data?.privacy_level_options ?? [], Boolean(opts.tiktokPublic)));
  const b = await j(await f(`${TT}${req.path}`, { method: "POST", headers: h, body: JSON.stringify(req.body), signal: timeout() }));
  return String(b.data?.publish_id ?? "");
}

import type { RecentPost } from "./social.ts";
export type { RecentPost };
/** Recente posts en basiscijfers, voor zover de API ze geeft. */
export async function recentPosts(a: Account, f: F = fetch): Promise<RecentPost[]> {
  if (a.platform === "facebook") {
    const b = await j(await f(`${GRAPH}/${a.accountId}/posts?fields=message,created_time,permalink_url&limit=5&access_token=${encodeURIComponent(a.token)}`, { signal: timeout() }));
    return (b.data ?? []).map((p: any) => ({ platform: "facebook", text: String(p.message ?? ""), at: String(p.created_time ?? ""), url: String(p.permalink_url ?? ""), stats: "" }));
  }
  if (a.platform === "instagram") {
    const b = await j(await f(`${GRAPH}/${a.accountId}/media?fields=caption,timestamp,permalink,like_count,comments_count&limit=5&access_token=${encodeURIComponent(a.token)}`, { signal: timeout() }));
    return (b.data ?? []).map((p: any) => ({ platform: "instagram", text: String(p.caption ?? ""), at: String(p.timestamp ?? ""), url: String(p.permalink ?? ""), stats: `${p.like_count ?? 0} likes · ${p.comments_count ?? 0} reacties` }));
  }
  const b = await j(await f(`${TT}/v2/video/list/?fields=id,title,create_time,share_url,view_count,like_count,comment_count`, { method: "POST", headers: { authorization: `Bearer ${a.token}`, "content-type": "application/json" }, body: JSON.stringify({ max_count: 5 }), signal: timeout() }));
  return (b.data?.videos ?? []).map((v: any) => ({ platform: "tiktok", text: String(v.title ?? ""), at: v.create_time ? new Date(Number(v.create_time) * 1000).toISOString() : "", url: String(v.share_url ?? ""), stats: `${v.view_count ?? 0} views · ${v.like_count ?? 0} likes` }));
}

export async function tiktokRefresh(refresh: string, f: F = fetch): Promise<{ token: string; refresh: string; expiresIn: number }> {
  const t = await j(await f(`${TT}/v2/oauth/token/`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_key: env("TIKTOK_CLIENT_KEY") ?? "", client_secret: env("TIKTOK_CLIENT_SECRET") ?? "", grant_type: "refresh_token", refresh_token: refresh }), signal: timeout() }));
  return { token: String(t.access_token), refresh: String(t.refresh_token ?? refresh), expiresIn: Number(t.expires_in ?? 86400) };
}
