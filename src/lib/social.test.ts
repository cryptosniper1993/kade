import { test } from "node:test";
import assert from "node:assert/strict";
import { facebookRequest, instagramContainer, metaAuthorizeUrl, pickPrivacy, tiktokAuthorizeUrl, tiktokInit, validateDraft, isDue } from "./social.ts";
import { publishTo, recentPosts } from "./social.server.ts";

const img = { platforms: ["facebook", "instagram", "tiktok"] as const, body: "Hallo", mediaUrl: "https://cdn.example.invalid/a.jpg", mediaType: "afbeelding" as const };
const d = { ...img, platforms: [...img.platforms] };

test("validatie: Instagram en TikTok vereisen media, https verplicht", () => {
  assert.deepEqual(validateDraft(d), []);
  assert.ok(validateDraft({ ...d, mediaType: "geen", mediaUrl: "" }).some((e) => e.includes("Instagram")));
  assert.ok(validateDraft({ ...d, mediaUrl: "http://x" }).some((e) => e.includes("https")));
  assert.ok(validateDraft({ ...d, platforms: [] }).length > 0);
  assert.deepEqual(validateDraft({ platforms: ["facebook"], body: "tekst", mediaUrl: "", mediaType: "geen" }), []);
});

test("payloads per platform", () => {
  assert.equal(facebookRequest("P1", { ...d, mediaType: "geen" }).path, "/P1/feed");
  assert.equal(facebookRequest("P1", d).path, "/P1/photos");
  assert.equal(facebookRequest("P1", { ...d, mediaType: "video" }).params.file_url, d.mediaUrl);
  assert.equal(instagramContainer({ ...d, mediaType: "video" }).media_type, "REELS");
  assert.equal(tiktokInit({ ...d, mediaType: "video" }, "SELF_ONLY").path, "/v2/post/publish/video/init/");
  assert.equal((tiktokInit(d, "SELF_ONLY").body as any).media_type, "PHOTO");
});

test("TikTok privacy blijft privé tenzij audit", () => {
  const o = ["PUBLIC_TO_EVERYONE", "SELF_ONLY"];
  assert.equal(pickPrivacy(o, false), "SELF_ONLY");
  assert.equal(pickPrivacy(o, true), "PUBLIC_TO_EVERYONE");
  assert.equal(pickPrivacy(["SELF_ONLY"], true), "SELF_ONLY");
});

test("authorize-URL's bevatten state en scopes", () => {
  const m = new URL(metaAuthorizeUrl("APP", "https://k.example/api/social/callback?p=meta", "S1"));
  assert.equal(m.searchParams.get("state"), "S1");
  assert.ok(m.searchParams.get("scope")!.includes("instagram_content_publish"));
  assert.ok(new URL(tiktokAuthorizeUrl("CK", "https://k.example/cb", "S2")).searchParams.get("scope")!.includes("video.publish"));
  assert.ok(isDue(null) && isDue("2000-01-01T00:00:00Z") && !isDue("2999-01-01T00:00:00Z"));
});

test("publiceren gaat enkel via de (gemockte) fetch, niets echt gepost", async () => {
  const calls: string[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url.split("?")[0]}`);
    if (url.includes("creator_info")) return new Response(JSON.stringify({ data: { privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"] }, error: { code: "ok" } }));
    if (url.includes("/init/")) { assert.equal(JSON.parse(String(init?.body)).post_info.privacy_level, "SELF_ONLY"); return new Response(JSON.stringify({ data: { publish_id: "pub1" }, error: { code: "ok" } })); }
    if (url.endsWith("/media")) return new Response(JSON.stringify({ id: "c1" }));
    if (url.includes("media_publish")) return new Response(JSON.stringify({ id: "ig1" }));
    if (url.includes("/photos")) return new Response(JSON.stringify({ id: "ph", post_id: "fb1" }));
    return new Response(JSON.stringify({ error: { message: "onverwacht" } }), { status: 400 });
  }) as typeof fetch;
  assert.equal(await publishTo({ platform: "facebook", accountId: "P", accountName: "", token: "t" }, d, f), "fb1");
  assert.equal(await publishTo({ platform: "instagram", accountId: "IG", accountName: "", token: "t" }, d, f), "ig1");
  assert.equal(await publishTo({ platform: "tiktok", accountId: "o", accountName: "", token: "t" }, d, f), "pub1");
  assert.ok(calls.every((c) => !c.includes("example.invalid")));
  await assert.rejects(recentPosts({ platform: "facebook", accountId: "P", accountName: "", token: "t" }, f), /onverwacht/);
});
