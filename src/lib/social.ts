/** Socials: pure helpers (client-veilig, testbaar). Geen netwerk hier. */
export const SOCIAL_PLATFORMS = ["facebook", "instagram", "tiktok"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export const SOCIAL_LABEL: Record<SocialPlatform, string> = { facebook: "Facebook-pagina", instagram: "Instagram", tiktok: "TikTok" };
export type MediaType = "geen" | "afbeelding" | "video";
export const GRAPH = "https://graph.facebook.com/v23.0";
export const META_SCOPES = ["pages_show_list", "pages_manage_posts", "pages_read_engagement", "business_management", "instagram_basic", "instagram_content_publish", "instagram_manage_insights"];
export const TIKTOK_SCOPES = ["user.info.basic", "video.publish", "video.list"];
export const SOCIAL_ENV: Record<"meta" | "tiktok", string[]> = { meta: ["META_APP_ID", "META_APP_SECRET"], tiktok: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"] };

export function isPlatform(v: unknown): v is SocialPlatform { return typeof v === "string" && (SOCIAL_PLATFORMS as readonly string[]).includes(v); }
export function provider(p: SocialPlatform): "meta" | "tiktok" { return p === "tiktok" ? "tiktok" : "meta"; }

export function metaAuthorizeUrl(appId: string, redirect: string, state: string): string {
  const q = new URLSearchParams({ client_id: appId, redirect_uri: redirect, state, response_type: "code", scope: META_SCOPES.join(",") });
  return `https://www.facebook.com/v23.0/dialog/oauth?${q}`;
}
export function tiktokAuthorizeUrl(clientKey: string, redirect: string, state: string): string {
  const q = new URLSearchParams({ client_key: clientKey, redirect_uri: redirect, state, response_type: "code", scope: TIKTOK_SCOPES.join(",") });
  return `https://www.tiktok.com/v2/auth/authorize/?${q}`;
}

export interface Draft { platforms: SocialPlatform[]; body: string; mediaUrl: string; mediaType: MediaType }

/** Controleert wat elk platform minstens nodig heeft. Geeft foutmeldingen in het Nederlands. */
export function validateDraft(d: Draft): string[] {
  const e: string[] = [];
  if (!d.platforms.length) e.push("Kies minstens één platform.");
  if (!d.body.trim() && d.mediaType === "geen") e.push("Schrijf een tekst of voeg media toe.");
  if (d.mediaType !== "geen" && !/^https:\/\/\S+$/.test(d.mediaUrl)) e.push("Media moet een publieke https-URL zijn (de platformen halen het bestand zelf op).");
  if (d.platforms.includes("instagram") && d.mediaType === "geen") e.push("Instagram vereist een afbeelding of video.");
  if (d.platforms.includes("tiktok") && d.mediaType === "geen") e.push("TikTok vereist een video of afbeelding.");
  if (d.platforms.includes("instagram") && d.body.length > 2200) e.push("Instagram: maximaal 2200 tekens.");
  if (d.platforms.includes("tiktok") && d.body.length > 2200) e.push("TikTok: maximaal 2200 tekens.");
  return e;
}

/** Facebook-pagina: endpoint en velden. */
export function facebookRequest(pageId: string, d: Draft): { path: string; params: Record<string, string> } {
  if (d.mediaType === "afbeelding") return { path: `/${pageId}/photos`, params: { url: d.mediaUrl, caption: d.body } };
  if (d.mediaType === "video") return { path: `/${pageId}/videos`, params: { file_url: d.mediaUrl, description: d.body } };
  return { path: `/${pageId}/feed`, params: { message: d.body } };
}
/** Instagram: stap 1 container, stap 2 media_publish. */
export function instagramContainer(d: Draft): Record<string, string> {
  return d.mediaType === "video" ? { media_type: "REELS", video_url: d.mediaUrl, caption: d.body } : { image_url: d.mediaUrl, caption: d.body };
}
/** TikTok Direct Post. Niet-geauditeerde apps mogen enkel SELF_ONLY (privé). */
export function tiktokInit(d: Draft, privacy: string): { path: string; body: Record<string, unknown> } {
  const post_info = { title: d.body.slice(0, 2200), privacy_level: privacy, brand_content_toggle: false, brand_organic_toggle: false };
  if (d.mediaType === "afbeelding") {
    return { path: "/v2/post/publish/content/init/", body: { post_info: { ...post_info, description: d.body.slice(0, 4000) }, source_info: { source: "PULL_FROM_URL", photo_images: [d.mediaUrl], photo_cover_index: 0 }, post_mode: "DIRECT_POST", media_type: "PHOTO" } };
  }
  return { path: "/v2/post/publish/video/init/", body: { post_info, source_info: { source: "PULL_FROM_URL", video_url: d.mediaUrl } } };
}
/** Kies de privacy: de veiligste die TikTok aanbiedt, tenzij publiek expliciet toegelaten (na audit). */
export function pickPrivacy(options: string[], allowPublic: boolean): string {
  if (allowPublic && options.includes("PUBLIC_TO_EVERYONE")) return "PUBLIC_TO_EVERYONE";
  return options.includes("SELF_ONLY") ? "SELF_ONLY" : options[0] ?? "SELF_ONLY";
}
export function isDue(scheduledAt: string | null, now = Date.now()): boolean { return !scheduledAt || Date.parse(scheduledAt) <= now; }

export interface RecentPost { platform: SocialPlatform; text: string; at: string; url: string; stats: string }
