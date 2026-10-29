import { db, str } from "@/lib/ops-shared";
import { env } from "@/lib/env.server";
import { audit } from "@/lib/ops-jam";
import { SOCIAL_ENV, SOCIAL_PLATFORMS, isPlatform, provider, type MediaType, type SocialPlatform } from "@/lib/social";
import type { SocialPost, SocialStatus } from "@/lib/ops-social";
import { publishTo, seal, socialRedirect, tiktokRefresh, unseal, type Account } from "@/lib/social.server";
type Sql = Awaited<ReturnType<typeof db>>;

/** Server-only opslag voor socials (tokens ontsleutelen, publiceren). */
export async function socialStatus(sql: Sql, u: string): Promise<SocialStatus[]> {
  const rows = await sql<Record<string, unknown>>`select * from social_accounts where user_id = ${u}`;
  return SOCIAL_PLATFORMS.map((p) => {
    const r = rows.find((x) => x.platform === p);
    return { platform: p, connected: Boolean(r?.token_enc), accountName: str(r?.account_name, 160), connectedAt: r?.connected_at ? new Date(String(r.connected_at)).toISOString() : null,
      envMissing: SOCIAL_ENV[provider(p)].filter((n) => !env(n)), redirectUri: socialRedirect(provider(p)) };
  });
}

export async function account(sql: Sql, u: string, p: SocialPlatform): Promise<Account | null> {
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

export function mapPost(r: Record<string, unknown>): SocialPost {
  return { id: str(r.id, 80), platforms: ((r.platforms as string[]) ?? []).filter(isPlatform), body: str(r.body, 5000), mediaUrl: str(r.media_url, 2000),
    mediaType: (["afbeelding", "video"].includes(String(r.media_type)) ? r.media_type : "geen") as MediaType,
    scheduledAt: r.scheduled_at ? new Date(String(r.scheduled_at)).toISOString() : null, status: str(r.status, 20),
    results: (r.results ?? {}) as Record<string, string>, createdAt: new Date(String(r.created_at)).toISOString() };
}

export async function publishRow(sql: Sql, u: string, post: SocialPost): Promise<SocialPost> {
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
export async function processDue(sql: Sql, u: string) {
  const due = (await sql<Record<string, unknown>>`select * from social_posts where user_id = ${u} and status = 'gepland' and scheduled_at <= now() order by scheduled_at limit 5`).map(mapPost);
  for (const p of due) await publishRow(sql, u, p);
}


export { socialRedirect } from "@/lib/social.server";
export { recentPosts } from "@/lib/social.server";
