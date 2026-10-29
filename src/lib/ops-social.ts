import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { db, str, uid } from "@/lib/ops-shared";
import { env } from "@/lib/env.server";
import { audit } from "@/lib/ops-jam";
import { SOCIAL_ENV, SOCIAL_PLATFORMS, isDue, isPlatform, metaAuthorizeUrl, provider, tiktokAuthorizeUrl, validateDraft, type Draft, type MediaType, type SocialPlatform } from "@/lib/social";
import { publishTo, recentPosts, seal, socialRedirect, tiktokRefresh, unseal, type Account, type RecentPost } from "@/lib/social.server";
type Sql = Awaited<ReturnType<typeof db>>;

/** Socials (Facebook-pagina, Instagram, TikTok). Tokens versleuteld in de DB, nooit naar de browser. */
export interface SocialStatus { platform: SocialPlatform; connected: boolean; accountName: string; connectedAt: string | null; envMissing: string[]; redirectUri: string }
export interface SocialPost { id: string; platforms: SocialPlatform[]; body: string; mediaUrl: string; mediaType: MediaType; scheduledAt: string | null; status: string; results: Record<string, string>; createdAt: string }

export async function socialStatus(sql: Sql, u: string): Promise<SocialStatus[]> {
  const rows = await sql<Record<string, unknown>>`select * from social_accounts where user_id = ${u}`;
  return SOCIAL_PLATFORMS.map((p) => {
    const r = rows.find((x) => x.platform === p);
    return { platform: p, connected: Boolean(r?.token_enc), accountName: str(r?.account_name, 160), connectedAt: r?.connected_at ? new Date(String(r.connected_at)).toISOString() : null,
      envMissing: SOCIAL_ENV[provider(p)].filter((n) => !env(n)), redirectUri: socialRedirect(provider(p)) };
  });
}

async function account(sql: Sql, u: string, p: SocialPlatform): Promise<Account | null> {
  const r = (await sql<Record<string, unknown>>`select * from social_accounts where user_id = ${u} and platform = ${p}`)[0];
  if (!r?.token_enc) return null;
  const t = JSON.parse(unseal(String(r.token_enc))) as { token: string; refresh?: string };
  if (p === "tiktok" && t.refresh && r.expires_at && Date.parse(String(r.expires_at)) < Date.now() + 60_000) {
    const n = await tiktokRefresh(t.refresh);
    t.token = n.token; t.refresh = n.refresh;
    await sql`update social_accounts set token_enc = ${seal(JSON.stringify(t))}, expires_at = ${new Date(Date.now() + n.expiresIn * 1000).toISOString()} where user_id = ${u} and platform = ${p}`;
  }
  return { platform: p, accountId: str(r.account_id, 120), accountName: str(r.account_name, 160), token: t.token };
}

function mapPost(r: Record<string, unknown>): SocialPost {
  return { id: str(r.id, 80), platforms: ((r.platforms as string[]) ?? []).filter(isPlatform), body: str(r.body, 5000), mediaUrl: str(r.media_url, 2000),
    mediaType: (["afbeelding", "video"].includes(String(r.media_type)) ? r.media_type : "geen") as MediaType,
    scheduledAt: r.scheduled_at ? new Date(String(r.scheduled_at)).toISOString() : null, status: str(r.status, 20),
    results: (r.results ?? {}) as Record<string, string>, createdAt: new Date(String(r.created_at)).toISOString() };
}

async function publishRow(sql: Sql, u: string, post: SocialPost): Promise<SocialPost> {
  const results: Record<string, string> = { ...post.results };
  let okAll = true;
  for (const p of post.platforms) {
    if (results[p]?.startsWith("ok:")) continue;
    try {
      const a = await account(sql, u, p);
      if (!a) throw new Error("niet verbonden");
      results[p] = `ok:${await publishTo(a, post, fetch, { tiktokPublic: env("TIKTOK_AUDITED") === "true" })}`;
    } catch (e) { okAll = false; results[p] = `fout:${e instanceof Error ? e.message.slice(0, 200) : "mislukt"}`; }
  }
  const status = okAll ? "gepubliceerd" : "mislukt";
  await sql`update social_posts set results = ${JSON.stringify(results)}::jsonb, status = ${status}, published_at = ${okAll ? new Date().toISOString() : null} where id = ${post.id} and user_id = ${u}`;
  await audit(sql, u, "kobe", "social.publish", "social", post.id, `${status} ${post.platforms.join(",")}`);
  return { ...post, results, status };
}

/** Geplande posts die vervallen zijn worden gepubliceerd wanneer Social geopend wordt (geen cron nodig). */
async function processDue(sql: Sql, u: string) {
  const due = (await sql<Record<string, unknown>>`select * from social_posts where user_id = ${u} and status = 'gepland' and scheduled_at <= now() order by scheduled_at limit 5`).map(mapPost);
  for (const p of due) await publishRow(sql, u, p);
}

export const loadSocial = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db(); const u = context.userId;
    await processDue(sql, u).catch(() => {});
    const posts = (await sql<Record<string, unknown>>`select * from social_posts where user_id = ${u} order by created_at desc limit 50`).map(mapPost);
    return { status: await socialStatus(sql, u), posts };
  });

export const loadRecentSocial = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ recent: RecentPost[]; errors: string[] }> => {
    const sql = await db(); const recent: RecentPost[] = []; const errors: string[] = [];
    for (const p of SOCIAL_PLATFORMS) {
      try { const a = await account(sql, context.userId, p); if (a) recent.push(...(await recentPosts(a))); }
      catch (e) { errors.push(`${p}: ${e instanceof Error ? e.message : "mislukt"}`); }
    }
    return { recent, errors };
  });

export const startSocialOAuth = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { provider: string }) => ({ provider: d.provider === "tiktok" ? "tiktok" as const : "meta" as const }))
  .handler(async ({ context, data }) => {
    const missing = SOCIAL_ENV[data.provider].filter((n) => !env(n));
    if (missing.length) throw new Error(`Ontbreekt op de server: ${missing.join(", ")}.`);
    const sql = await db(); const state = uid(); const p = data.provider === "tiktok" ? "tiktok" : "facebook";
    await sql`insert into social_accounts (user_id, platform, oauth_state) values (${context.userId}, ${p}, ${state})
      on conflict (user_id, platform) do update set oauth_state = excluded.oauth_state`;
    return { url: data.provider === "tiktok" ? tiktokAuthorizeUrl(env("TIKTOK_CLIENT_KEY")!, socialRedirect("tiktok"), state) : metaAuthorizeUrl(env("META_APP_ID")!, socialRedirect("meta"), state) };
  });

export const disconnectSocial = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { platform: string }) => { if (!isPlatform(d.platform)) throw new Error("Onbekend platform."); return { platform: d.platform }; })
  .handler(async ({ context, data }) => {
    const sql = await db();
    await sql`delete from social_accounts where user_id = ${context.userId} and platform = ${data.platform}`;
    await audit(sql, context.userId, "kobe", "social.disconnect", "social", "", data.platform);
    return { ok: true };
  });

export const saveSocialPost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { platforms: string[]; body: string; mediaUrl: string; mediaType: string; scheduledAt: string | null; publishNow: boolean }) => ({
    platforms: (d.platforms ?? []).filter(isPlatform), body: str(d.body, 5000), mediaUrl: str(d.mediaUrl, 2000).trim(),
    mediaType: (["afbeelding", "video"].includes(d.mediaType) ? d.mediaType : "geen") as MediaType,
    scheduledAt: d.scheduledAt && !Number.isNaN(Date.parse(d.scheduledAt)) ? new Date(d.scheduledAt).toISOString() : null, publishNow: d.publishNow === true,
  }))
  .handler(async ({ context, data }) => {
    const draft: Draft = data;
    const errs = validateDraft(draft);
    if (errs.length) throw new Error(errs.join(" "));
    const sql = await db(); const u = context.userId; const id = uid();
    const status = data.publishNow ? "bezig" : data.scheduledAt ? "gepland" : "concept";
    await sql`insert into social_posts (id, user_id, platforms, body, media_url, media_type, scheduled_at, status)
      values (${id}, ${u}, ${data.platforms}, ${data.body}, ${data.mediaUrl}, ${data.mediaType}, ${data.scheduledAt}, ${status})`;
    await audit(sql, u, "kobe", "social.save", "social", id, status);
    const row = mapPost((await sql<Record<string, unknown>>`select * from social_posts where id = ${id}`)[0]);
    if (data.publishNow || (data.scheduledAt && isDue(data.scheduledAt))) return publishRow(sql, u, row);
    return row;
  });

export const publishSocialPost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => ({ id: str(d.id, 80) }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    const r = (await sql<Record<string, unknown>>`select * from social_posts where id = ${data.id} and user_id = ${context.userId}`)[0];
    if (!r) throw new Error("Post niet gevonden.");
    return publishRow(sql, context.userId, mapPost(r));
  });

export const deleteSocialPost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => ({ id: str(d.id, 80) }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    await sql`delete from social_posts where id = ${data.id} and user_id = ${context.userId} and status <> 'gepubliceerd'`;
    return { ok: true };
  });
