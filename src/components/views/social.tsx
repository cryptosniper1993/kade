import { useEffect, useState } from "react";
import { deleteSocialPost, disconnectSocial, loadRecentSocial, loadSocial, publishSocialPost, saveSocialPost, startSocialOAuth, type SocialPost, type SocialStatus } from "@/lib/ops-social";
import { SOCIAL_LABEL, SOCIAL_PLATFORMS, validateDraft, type MediaType, type SocialPlatform } from "@/lib/social";
import type { RecentPost } from "@/lib/social";
import { Area, Button, Field, Panel, Select, TextInput } from "@/components/ui";

/** Social: koppelingen per platform (ook op #setup) en een eenvoudige post-opsteller. */
export function SocialConnections({ notice, onChange }: { notice: (m: string) => void; onChange?: (s: SocialStatus[]) => void }) {
  const [st, setSt] = useState<SocialStatus[]>([]);
  const [busy, setBusy] = useState(false);
  async function reload() { const r = await loadSocial(); setSt(r.status); onChange?.(r.status); }
  useEffect(() => { reload().catch(() => {}); }, []);
  async function connect(p: SocialPlatform) {
    setBusy(true);
    try { const r = await startSocialOAuth({ data: { provider: p === "tiktok" ? "tiktok" : "meta" } }); window.location.href = r.url; }
    catch (e) { notice(e instanceof Error ? e.message : "Mislukt."); setBusy(false); }
  }
  return (
    <ul className="grid gap-2 md:grid-cols-3" data-testid="social-connections">
      {st.map((s) => (
        <li key={s.platform} className="flex flex-col gap-2 rounded-sm border border-line p-3 text-sm">
          <b>{SOCIAL_LABEL[s.platform]}</b>
          <span>{s.connected ? `Verbonden${s.accountName ? `: ${s.accountName}` : ""}` : "Niet verbonden"}</span>
          {s.envMissing.length > 0 && <span className="text-mist">Ontbreekt op de server: {s.envMissing.join(", ")}</span>}
          <span className="text-mist break-all">Redirect-URI: {s.redirectUri}</span>
          <span className="flex gap-2">
            {s.platform !== "instagram" && <Button variant="ghost" disabled={busy} onClick={() => connect(s.platform)}>{s.connected ? "Opnieuw verbinden" : "Verbinden"}</Button>}
            {s.platform === "instagram" && !s.connected && <span className="text-mist">Verbindt mee via Facebook (professioneel account gekoppeld aan de pagina).</span>}
            {s.connected && <Button variant="ghost" disabled={busy} onClick={async () => { await disconnectSocial({ data: { platform: s.platform } }); notice("Verbinding verbroken."); await reload(); }}>Verbreek</Button>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SocialView({ notice }: { notice: (m: string) => void }) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [status, setStatus] = useState<SocialStatus[]>([]);
  const [recent, setRecent] = useState<{ recent: RecentPost[]; errors: string[] } | null>(null);
  const [f, setF] = useState({ platforms: [] as SocialPlatform[], body: "", mediaUrl: "", mediaType: "geen" as MediaType, scheduledAt: "" });
  const [busy, setBusy] = useState(false);
  async function reload() { const r = await loadSocial(); setPosts(r.posts); setStatus(r.status); }
  useEffect(() => {
    reload().catch(() => {});
    const m = new URLSearchParams(window.location.search).get("social");
    if (m) { notice(`Social: ${m}`); history.replaceState(null, "", window.location.pathname + window.location.hash); }
  }, []);
  async function save(publishNow: boolean) {
    setBusy(true);
    try {
      const r = await saveSocialPost({ data: { ...f, scheduledAt: f.scheduledAt ? new Date(f.scheduledAt).toISOString() : null, publishNow } });
      notice(r.status === "gepubliceerd" ? "Gepubliceerd." : r.status === "mislukt" ? "Niet overal gelukt: zie de lijst." : r.status === "gepland" ? "Ingepland." : "Concept bewaard.");
      setF({ ...f, body: "", mediaUrl: "" }); await reload();
    } catch (e) { notice(e instanceof Error ? e.message : "Mislukt."); } finally { setBusy(false); }
  }
  const errs = validateDraft(f);
  const connected = status.filter((s) => s.connected).map((s) => s.platform);
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-3xl">Koppelingen</h2>
        <SocialConnections notice={notice} onChange={setStatus} />
        <p className="max-w-3xl text-sm text-mist text-pretty">Instagram en Facebook vereisen een Meta-app met goedgekeurde permissies (App Review) en een professioneel Instagram-account gekoppeld aan een Facebook-pagina. TikTok-posts blijven <b>privé</b> (alleen jij) tot de TikTok-app een audit doorstaat. Zie de handleiding Social.</p>
      </section>
      <Panel className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">Nieuwe post</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          {SOCIAL_PLATFORMS.map((p) => (
            <label key={p} className="flex items-center gap-1">
              <input type="checkbox" checked={f.platforms.includes(p)} onChange={(e) => setF({ ...f, platforms: e.target.checked ? [...f.platforms, p] : f.platforms.filter((x) => x !== p) })} />
              {SOCIAL_LABEL[p]}{!connected.includes(p) && <span className="text-mist"> (niet verbonden)</span>}
            </label>
          ))}
        </div>
        <Field label="Tekst"><Area rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Media"><Select value={f.mediaType} onChange={(e) => setF({ ...f, mediaType: e.target.value as MediaType })}><option value="geen">Geen</option><option value="afbeelding">Afbeelding</option><option value="video">Video</option></Select></Field>
          <Field label="Publieke media-URL (https)"><TextInput value={f.mediaUrl} placeholder="https://…/beeld.jpg" onChange={(e) => setF({ ...f, mediaUrl: e.target.value })} /></Field>
          <Field label="Inplannen (leeg = concept)"><TextInput type="datetime-local" value={f.scheduledAt} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} /></Field>
        </div>
        {errs.length > 0 && <p className="text-sm text-mist">{errs.join(" ")}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || errs.length > 0} onClick={() => save(true)}>Nu publiceren</Button>
          <Button variant="ghost" disabled={busy || errs.length > 0} onClick={() => save(false)}>{f.scheduledAt ? "Inplannen" : "Bewaar concept"}</Button>
        </div>
        <p className="text-xs text-mist">Ingeplande posts gaan uit zodra iemand Social opent na het geplande tijdstip (geen aparte cron).</p>
      </Panel>
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-2xl">Posts in KADE</h2>
        {posts.length === 0 && <p className="text-sm text-mist">Nog geen posts.</p>}
        <ul className="flex flex-col gap-2">
          {posts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 rounded-sm border border-line px-3 py-2 text-sm">
              <span><b>{p.status}</b> · {p.platforms.map((x) => SOCIAL_LABEL[x]).join(", ")}{p.scheduledAt ? ` · ${new Date(p.scheduledAt).toLocaleString("nl-BE")}` : ""}<br />{p.body.slice(0, 160)}
                {Object.entries(p.results).map(([k, v]) => <span key={k} className="block text-mist">{k}: {v}</span>)}</span>
              {p.status !== "gepubliceerd" && <span className="flex gap-2">
                <Button variant="ghost" disabled={busy} onClick={async () => { setBusy(true); try { await publishSocialPost({ data: { id: p.id } }); await reload(); } catch (e) { notice(e instanceof Error ? e.message : "Mislukt."); } finally { setBusy(false); } }}>Publiceer</Button>
                <Button variant="ghost" disabled={busy} onClick={async () => { await deleteSocialPost({ data: { id: p.id } }); await reload(); }}>Verwijder</Button>
              </span>}
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between"><h2 className="font-display text-2xl">Recent op de platformen</h2>
          <Button variant="ghost" disabled={busy} onClick={async () => setRecent(await loadRecentSocial())}>Ophalen</Button></div>
        {recent?.errors.map((e) => <p key={e} className="text-sm text-mist">{e}</p>)}
        <ul className="flex flex-col gap-1 text-sm">
          {recent?.recent.map((r, i) => <li key={i}>{SOCIAL_LABEL[r.platform]} · {r.at.slice(0, 10)} · {r.text.slice(0, 100)} {r.stats && `· ${r.stats}`} {r.url && <a className="underline" href={r.url} target="_blank" rel="noreferrer">open</a>}</li>)}
        </ul>
        {recent && recent.recent.length === 0 && recent.errors.length === 0 && <p className="text-sm text-mist">Geen verbonden accounts of nog geen posts.</p>}
      </section>
    </div>
  );
}
