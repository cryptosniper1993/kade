import { useEffect, useState } from "react";
import { loadSetup } from "@/lib/ops-setup";
import { progress, type CheckState } from "@/lib/setup-checks";
import type { Desk } from "@/lib/types";
import { PeppolSettings } from "@/components/views/peppol-settings";
import { MailSettings } from "@/components/views/mail-settings";
import { SocialConnections } from "@/components/views/social";
import { Button, Kicker, Panel } from "@/components/ui";

type Setup = Awaited<ReturnType<typeof loadSetup>>;

const BADGE: Record<CheckState, string> = {
  ok: "border-emerald-500/60 text-emerald-400",
  ontbreekt: "border-red-500/60 text-red-400",
  optioneel: "border-line text-mist",
};

export function StatusBadge({ s }: { s: CheckState }) {
  return <span data-state={s} className={`rounded-sm border px-2 py-0.5 text-xs tracking-widest uppercase ${BADGE[s]}`}>{s === "ok" ? "OK" : s}</span>;
}

const ZOHO: { label: string; note: string }[] = [
  { label: "Zoho Mail gratis: geen SMTP/IMAP", note: "Mailverbinding op 'Mailprogramma' (mailto/.eml); Zoho zet de handtekening." },
  { label: "SPF-record bevat include:zoho.eu", note: "DNS bij je domeinregistrar." },
  { label: "DKIM aan in Zoho (Mail Admin > Domains > Email Authentication)", note: "Selector-record in DNS." },
  { label: "DMARC p=none (optioneel)", note: "_dmarc TXT: v=DMARC1; p=none; rua=mailto:dmarc@jouwdomein.be" },
];

/** #setup: één pagina met de status van alle configuratie, met links naar de detailinstellingen. */
export function SetupView({ desk, notice, go }: { desk: Desk; notice: (m: string) => void; go: (id: string) => void }) {
  const [s, setS] = useState<Setup | null>(null);
  const [zoho, setZoho] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("kade-setup-zoho") ?? "{}"); } catch { return {}; }
  });
  const reload = () => loadSetup().then(setS).catch(() => notice("Setup laden mislukt."));
  useEffect(() => { reload(); }, []);
  const p = s ? progress(s.checks) : { done: 0, total: 0, pct: 0 };
  const groups = s ? [...new Set(s.envs.map((e) => e.group))] : [];
  return (
    <div className="flex flex-col gap-8">
      <header>
        <Kicker>Setup</Kicker>
        <h1 className="mt-2 font-display text-5xl">Alles op één plek.</h1>
        <p className="mt-2 max-w-2xl text-mist text-pretty">Wat staat er klaar, wat ontbreekt nog? Geheime waarden zie je hier nooit: enkel of ze op de server gezet zijn. Klik door naar de detailinstellingen.</p>
      </header>
      <Panel className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between"><b>Checklist</b><span data-testid="setup-progress">{p.done}/{p.total} · {p.pct}%</span></div>
        {s && <p className="text-sm" data-testid="grok-health">Grok: <StatusBadge s={s.grok.state === "ok" ? "ok" : s.grok.state === "storing" ? "ontbreekt" : "optioneel"} /> {s.grok.state === "storing" ? "tijdelijk onbereikbaar: alles behalve AI-antwoorden werkt; Grok Bot-opdrachten wachten in de outbox" : s.grok.state === "uit" ? "niet ingesteld (XAI_API_KEY): KADE werkt zonder AI" : s.grok.state === "ok" ? "bereikbaar" : "nog niet gebruikt"} · wachtrij {s.grok.outbox}</p>}
        <div className="h-2 w-full rounded-sm bg-raised"><div className="h-2 rounded-sm bg-brass" style={{ width: `${p.pct}%` }} /></div>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {s?.checks.map((c) => (
          <Panel key={c.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2"><h2 className="font-display text-xl">{c.title}</h2><StatusBadge s={c.state} /></div>
            <p className="text-sm text-mist text-pretty">{c.detail}</p>
            {c.target && <div><Button variant="ghost" onClick={() => go(c.target)}>Instellen</Button></div>}
          </Panel>
        ))}
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-3xl">Netlify / env-variabelen</h2>
        <p className="max-w-2xl text-sm text-mist">Zet ze in Netlify &gt; Site configuration &gt; Environment variables. Zie docs/handleiding/hosting-netlify.md en database-neon.md. Database nu: <b>{s?.dbSource === "neon" ? "Postgres (DATABASE_URL)" : "PGlite (lokaal)"}</b>.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((g) => (
            <Panel key={g} className="flex flex-col gap-1">
              <b>{g}</b>
              {s!.envs.filter((e) => e.group === g).map((e) => (
                <div key={e.name} className="flex items-center justify-between gap-2 text-sm">
                  <span><code>{e.name}</code> <span className="text-xs text-mist">{e.note}</span></span>
                  <StatusBadge s={e.set ? "ok" : e.required ? "ontbreekt" : "optioneel"} />
                </div>
              ))}
            </Panel>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-3xl">Zoho en DMARC</h2>
        <Panel className="flex flex-col gap-2">
          {ZOHO.map((z) => (
            <label key={z.label} className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={Boolean(zoho[z.label])} onChange={(e) => { const n = { ...zoho, [z.label]: e.target.checked }; setZoho(n); localStorage.setItem("kade-setup-zoho", JSON.stringify(n)); }} />
              <span>{z.label}<br /><span className="text-xs text-mist">{z.note}</span></span>
            </label>
          ))}
        </Panel>
      </section>
      <section id="setup-social" className="flex flex-col gap-2"><h2 className="font-display text-2xl">Socials: status en verbreken</h2><SocialConnections notice={notice} /></section>
      <details className="flex flex-col gap-3"><summary className="cursor-pointer font-display text-2xl">Mailverbinding hier instellen</summary><MailSettings notice={notice} onChange={() => reload()} /></details>
      <details className="flex flex-col gap-3"><summary className="cursor-pointer font-display text-2xl">Peppol hier bekijken</summary><PeppolSettings desk={desk} notice={notice} /></details>
    </div>
  );
}
