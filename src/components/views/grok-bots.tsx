import { useEffect, useState } from "react";
import { cancelOutbox, loadOutbox, retryOutbox, type OutboxItem, deleteGrokBot, loadGrokBot, saveGrokBotEntry, sendToGrokBot, setActiveGrokBot, type GrokBotEntry, type GrokLogEntry } from "@/lib/ops-grokbot";
import { createBotKey, loadJam, revokeBotKey, type BotKey } from "@/lib/ops-jam";
import { parseGrokCommand } from "@/lib/grokbot";
import type { Desk } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Area, Button, Field, Kicker, Panel, Select, TextInput } from "@/components/ui";

type Draft = { id: string; name: string; role: string; grokBotId: string; scope: "sales" | "project"; projectId: string; webhookUrl: string; senderKey: string; headerMode: "bearer" | "custom"; headerName: string };
const EMPTY: Draft = { id: "", name: "", role: "", grokBotId: "", scope: "sales", projectId: "", webhookUrl: "", senderKey: "", headerMode: "bearer", headerName: "" };

/** GROK BOTS: alle Grok Bot-koppelingen op één plek. Kies de actieve bot, stuur een opdracht, bekijk zijn log. */
export function GrokBotsView({ desk, notice }: { desk: Desk; notice: (m: string) => void }) {
  const [bots, setBots] = useState<GrokBotEntry[]>([]);
  const [log, setLog] = useState<GrokLogEntry[]>([]);
  const [keys, setKeys] = useState<BotKey[]>([]);
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [line, setLine] = useState("");
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);

  async function load() {
    const res = await loadGrokBot();
    setBots(res.bots);
    setLog(res.log);
    setSelected((cur) => (res.bots.some((b) => b.id === cur) ? cur : res.activeId));
    const jam = await loadJam();
    setKeys(jam.keys);
    setOutbox(await loadOutbox().catch(() => []));
  }
  useEffect(() => { load().catch((e: unknown) => notice(e instanceof Error ? e.message : "Laden mislukt.")); }, []);

  const bot = bots.find((b) => b.id === selected) ?? null;
  const project = (id: string | null) => desk.projects.find((p) => p.id === id)?.name ?? "—";

  async function run<T>(fn: () => Promise<T>, ok?: string) {
    setBusy(true);
    try { await fn(); if (ok) notice(ok); await load(); }
    catch (e) { notice(e instanceof Error ? e.message : "Mislukt."); }
    finally { setBusy(false); }
  }

  async function send(test = false) {
    if (!bot) return;
    const opdracht = parseGrokCommand(line) ?? line.trim();
    if (!test && !opdracht) return notice("Typ eerst een opdracht.");
    await run(async () => {
      const res = await sendToGrokBot({ data: { botId: bot.id, opdracht, test, context: { view: bot.scope === "project" ? "projecten" : "grokbots", ids: bot.projectId ? [bot.projectId] : [], samenvatting: "" } } });
      notice(res.ok ? res.detail : res.detail);
      if (res.ok && !test) setLine("");
    });
  }

  const botKeys = keys.filter((k) => bot && (k.name === bot.name || (bot.projectId && k.projectId === bot.projectId)));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Kicker>GROK BOTS</Kicker>
        <h1 className="mt-2 font-display text-5xl">Wissel van bot met één klik.</h1>
        <p className="mt-2 max-w-2xl text-mist text-pretty">Elke bot heeft een eigen webhook en sleutel. Een projectbot ziet alleen zijn eigen project; vertrouwelijke projecten gaan nooit naar een andere bot. Bots maken enkel concepten: verzenden doet Kobe in Goedkeuring.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {bots.map((b) => (
          <button key={b.id} type="button" onClick={() => setSelected(b.id)}
            className={cn("rounded-md border p-4 text-left", b.id === selected ? "border-brass bg-raised" : "border-line bg-panel")}>
            <p className="text-xs tracking-widest text-mist uppercase">{b.active ? "actief · " : ""}{b.scope === "sales" ? "alle projecten" : `project: ${project(b.projectId)}`}</p>
            <p className="mt-1 font-display text-2xl">{b.name}</p>
            <p className="mt-1 text-sm text-mist">{b.role || "Geen rol"}</p>
            <p className="mt-2 text-xs text-mist">{b.configured ? `Sleutel ${b.keyMasked}` : "Nog niet gekoppeld"}{b.lastStatus != null ? ` · laatste HTTP ${b.lastStatus}` : ""}</p>
          </button>
        ))}
        <button type="button" onClick={() => setDraft({ ...EMPTY })} className="rounded-md border border-dashed border-line p-4 text-left text-mist hover:text-ivory">+ Bot toevoegen</button>
      </div>

      {bot && (
        <Panel className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Kicker>{bot.name}</Kicker>
            <span className="flex-1" />
            {!bot.active && <Button disabled={busy} onClick={() => run(() => setActiveGrokBot({ data: { id: bot.id } }), `${bot.name} is nu actief.`)}>Maak actief</Button>}
            <Button variant="ghost" disabled={busy} onClick={() => send(true)}>Test verbinding</Button>
            <Button variant="ghost" disabled={busy} onClick={() => setDraft({ id: bot.id, name: bot.name, role: bot.role, grokBotId: bot.grokBotId, scope: bot.scope, projectId: bot.projectId ?? "", webhookUrl: bot.webhookUrl, senderKey: "", headerMode: bot.headerMode, headerName: bot.headerName })}>Bewerken</Button>
            <Button variant="ghost" disabled={busy} onClick={() => { if (confirm(`${bot.name} verwijderen?`)) void run(() => deleteGrokBot({ data: { id: bot.id } }), "Bot verwijderd."); }}>Verwijderen</Button>
          </div>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <TextInput className="min-w-0 flex-1" value={line} onChange={(e) => setLine(e.target.value)} placeholder={`/grok opdracht voor ${bot.name}`} />
            <Button disabled={busy} type="submit">Stuur naar {bot.name}</Button>
          </form>

          <div className="mt-2 border-t border-line pt-3">
            <p className="text-sm">Inkomende bot-API (de bot schrijft concepten in KADE)</p>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-mist">
              {botKeys.map((k) => (
                <li key={k.id} className="flex items-center gap-2">
                  <span>{k.name} · {k.scope} · {k.hint} · {k.active ? "actief" : "ingetrokken"}</span>
                  {k.active && <Button variant="ghost" disabled={busy} onClick={() => run(() => revokeBotKey({ data: { id: k.id } }), "Sleutel ingetrokken.")}>Intrekken</Button>}
                </li>
              ))}
            </ul>
            <Button variant="ghost" disabled={busy} onClick={() => run(async () => {
              const r = await createBotKey({ data: { name: bot.name, grokBotId: bot.grokBotId, scope: bot.scope, projectId: bot.projectId ?? "" } });
              setNewKey(r.key);
            }, "Nieuwe API-sleutel aangemaakt.")}>Nieuwe API-sleutel</Button>
            {newKey && <p className="mt-2 text-sm break-all text-brass">Eenmalig zichtbaar, zet hem in de routine van de bot (niet in chat): <code>{newKey}</code></p>}
          </div>

          <div className="mt-2 border-t border-line pt-3">
            <p className="text-sm">Log van {bot.name}</p>
            <ul className="mt-2 flex flex-col gap-2">
              {log.filter((l) => l.botId === bot.id).slice(0, 30).map((l) => (
                <li key={l.id} className="rounded-sm border border-line px-3 py-2 text-sm">
                  <span className="text-xs text-mist">{new Date(l.createdAt).toLocaleString("nl-BE")} · {l.status == null ? "niet bereikt" : `HTTP ${l.status}`}</span>
                  <p className="whitespace-pre-wrap">{l.opdracht}</p>
                </li>
              ))}
              {!log.some((l) => l.botId === bot.id) && <li className="text-sm text-mist">Nog niets verstuurd.</li>}
            </ul>
          </div>
        </Panel>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl">Wachtrij (outbox)</h2>
          <Button variant="ghost" disabled={busy} onClick={() => run(async () => { const r = await retryOutbox({ data: { id: "" } }); notice(`${r.sent} alsnog verstuurd, ${r.failed} nog niet.`); })}>Nu opnieuw proberen</Button>
        </div>
        <p className="max-w-2xl text-sm text-mist text-pretty">Is een Grok Bot onbereikbaar, dan blijft de opdracht hier staan en probeert KADE opnieuw (1, 2, 4 … minuten, daarna elke 3 uur, ruim 2 dagen lang), telkens als iemand GROK BOTS of Setup opent of op de knop drukt.</p>
        {outbox.filter((o) => o.status !== "verzonden" && o.status !== "geannuleerd").length === 0 && <p className="text-sm text-mist">Niets in de wachtrij.</p>}
        <ul className="flex flex-col gap-2">
          {outbox.filter((o) => o.status !== "geannuleerd").slice(0, 30).map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line px-3 py-2 text-sm">
              <span><b>{o.status}</b> · {o.botName} · {o.attempts} poging(en){o.status === "wachtrij" ? ` · volgende ${new Date(o.nextAttemptAt).toLocaleString("nl-BE")}` : ""}{o.lastError ? ` · ${o.lastError}` : ""}<br /><span className="text-mist">{o.opdracht}</span></span>
              {o.status !== "verzonden" && <span className="flex gap-2">
                <Button variant="ghost" disabled={busy} onClick={() => run(() => retryOutbox({ data: { id: o.id } }), "Opnieuw geprobeerd.")}>Opnieuw</Button>
                <Button variant="ghost" disabled={busy} onClick={() => run(() => cancelOutbox({ data: { id: o.id } }), "Geannuleerd.")}>Annuleer</Button>
              </span>}
            </li>
          ))}
        </ul>
      </section>

      {draft && (
        <Panel className="grid gap-3 md:grid-cols-2">
          <Field label="Naam"><TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="joly jumper" /></Field>
          <Field label="Grok Bot-id (optioneel)"><TextInput value={draft.grokBotId} onChange={(e) => setDraft({ ...draft, grokBotId: e.target.value })} /></Field>
          <div className="md:col-span-2"><Field label="Rol / omschrijving"><Area value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} /></Field></div>
          <Field label="Scope">
            <Select value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value === "project" ? "project" : "sales" })}>
              <option value="sales">Alle projecten + prospectie (Head of Sales)</option>
              <option value="project">Eén project (projectbot)</option>
            </Select>
          </Field>
          <Field label="Project">
            <Select value={draft.projectId} disabled={draft.scope !== "project"} onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}>
              <option value="">—</option>
              {desk.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Webhook-URL"><TextInput value={draft.webhookUrl} onChange={(e) => setDraft({ ...draft, webhookUrl: e.target.value })} placeholder="https://…" /></Field>
          <Field label={draft.id ? "Sleutel (leeg = behouden)" : "Sleutel"}><TextInput type="password" autoComplete="off" value={draft.senderKey} onChange={(e) => setDraft({ ...draft, senderKey: e.target.value })} /></Field>
          <Field label="Header">
            <Select value={draft.headerMode} onChange={(e) => setDraft({ ...draft, headerMode: e.target.value === "custom" ? "custom" : "bearer" })}>
              <option value="bearer">Authorization: Bearer</option>
              <option value="custom">Eigen header</option>
            </Select>
          </Field>
          <Field label="Headernaam"><TextInput value={draft.headerName} disabled={draft.headerMode !== "custom"} onChange={(e) => setDraft({ ...draft, headerName: e.target.value })} /></Field>
          <div className="flex gap-2 md:col-span-2">
            <Button disabled={busy} onClick={() => run(async () => { const r = await saveGrokBotEntry({ data: draft }); setSelected(r.id); setDraft(null); }, "Bot bewaard.")}>Bewaren</Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>Annuleren</Button>
          </div>
        </Panel>
      )}
    </div>
  );
}
