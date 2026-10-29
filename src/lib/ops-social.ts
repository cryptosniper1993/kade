import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { db, str, uid } from "@/lib/ops-shared";
import { env } from "@/lib/env.server";
import { audit } from "@/lib/ops-jam";
import { SOCIAL_ENV, SOCIAL_PLATFORMS, isDue, isPlatform, metaAuthorizeUrl, tiktokAuthorizeUrl, validateDraft, type Draft, type MediaType, type SocialPlatform } from "@/lib/social";
import type { RecentPost } from "@/lib/social";
type Sql = Awaited<ReturnType<typeof db>>;

/** Socials (Facebook-pagina, Instagram, TikTok). Tokens versleuteld in de DB, nooit naar de browser. */
export interface SocialStatus { platform: SocialPlatform; connected: boolean; accountName: string; connectedAt: string | null; envMissing: string[]; redirectUri: string }
export interface SocialPost { id: string; platforms: SocialPlatform[]; body: string; mediaUrl: string; mediaType: MediaType; scheduledAt: string | null; status: string; results: Record<string, string>; createdAt: string }

export const loadSocial = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const S = await import("@/lib/social-store.server"); const sql = await db(); const u = context.userId;
    await S.processDue(sql, u).catch(() => {});
    const posts = (await sql<Record<string, unknown>>`select * from social_posts where user_id = ${u} order by created_at desc limit 50`).map(S.mapPost);
    return { status: await S.socialStatus(sql, u), posts };
  });

export const loadRecentSocial = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ recent: RecentPost[]; errors: string[] }> => {
    const S = await import("@/lib/social-store.server"); const sql = await db(); const recent: RecentPost[] = []; const errors: string[] = [];
    for (const p of SOCIAL_PLATFORMS) {
      try { const a = await S.account(sql, context.userId, p); if (a) recent.push(...(await S.recentPosts(a))); }
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
    const S = await import("@/lib/social-store.server"); const sql = await db(); const state = uid(); const p = data.provider === "tiktok" ? "tiktok" : "facebook";
    await sql`insert into social_accounts (user_id, platform, oauth_state) values (${context.userId}, ${p}, ${state})
      on conflict (user_id, platform) do update set oauth_state = excluded.oauth_state`;
    return { url: data.provider === "tiktok" ? tiktokAuthorizeUrl(env("TIKTOK_CLIENT_KEY")!, S.socialRedirect("tiktok"), state) : metaAuthorizeUrl(env("META_APP_ID")!, S.socialRedirect("meta"), state) };
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
    const S = await import("@/lib/social-store.server"); const sql = await db(); const u = context.userId; const id = uid();
    const status = data.publishNow ? "bezig" : data.scheduledAt ? "gepland" : "concept";
    await sql`insert into social_posts (id, user_id, platforms, body, media_url, media_type, scheduled_at, status)
      values (${id}, ${u}, ${data.platforms}, ${data.body}, ${data.mediaUrl}, ${data.mediaType}, ${data.scheduledAt}, ${status})`;
    await audit(sql, u, "kobe", "social.save", "social", id, status);
    const row = S.mapPost((await sql<Record<string, unknown>>`select * from social_posts where id = ${id}`)[0]);
    if (data.publishNow || (data.scheduledAt && isDue(data.scheduledAt))) return S.publishRow(sql, u, row);
    return row;
  });

export const publishSocialPost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => ({ id: str(d.id, 80) }))
  .handler(async ({ context, data }) => {
    const S = await import("@/lib/social-store.server"); const sql = await db();
    const r = (await sql<Record<string, unknown>>`select * from social_posts where id = ${data.id} and user_id = ${context.userId}`)[0];
    if (!r) throw new Error("Post niet gevonden.");
    return S.publishRow(sql, context.userId, S.mapPost(r));
  });

export const deleteSocialPost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => ({ id: str(d.id, 80) }))
  .handler(async ({ context, data }) => {
    const sql = await db();
    await sql`delete from social_posts where id = ${data.id} and user_id = ${context.userId} and status <> 'gepubliceerd'`;
    return { ok: true };
  });
