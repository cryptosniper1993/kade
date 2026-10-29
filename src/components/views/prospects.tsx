import { useEffect, useMemo, useState } from "react";
import { addDoNotContact, createLeadProject, importBatch, importProspects, loadJam, newApproval, purgeExpiredProspects, setProspect } from "@/lib/ops-jam";
import { PROSPECT_STATUSES, UNSUBSCRIBE_LINE, expired, followUpDue, pickBatch, type Prospect, type ProspectStatus } from "@/lib/outreach";
import { brusselsToday } from "@/lib/day";
import { Area, Button, Field, Kicker, Panel, Select, TextInput } from "@/components/ui";

type Jam = Awaited<ReturnType<typeof loadJam>>;

async function readFile(file: File): Promise<string> {
  return new TextDecoder("utf-8").decode(await file.arrayBuffer());
}

export function ProspectsView({ refresh, notice, go }: { refresh: () => Promise<void>; notice: (m: string) => void; go: (id: string) => void }) {
  const [jam, setJam] = useState<Jam | null>(null);
  const [filter, setFilter] = useState<"" | ProspectStatus | "opvolgen">("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Prospect | null>(null);
  const [busy, setBusy] = useState(false);
  const [batchNr, setBatchNr] = useState("");
  const [batchDate, setBatchDate] = useState("");
  const [mail, setMail] = useState({ subject: "", body: "" });
  const [dnc, setDnc] = useState("");
  const today = brusselsToday();

  async function load() { setJam(await loadJam()); }
  useEffect(() => { load().catch(() => notice("Prospecten laden mislukt.")); }, []);
  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try { await fn(); if (ok) notice(ok); await load(); } catch (e) { notice(e instanceof Error ? e.message : "Mislukt."); } finally { setBusy(false); }
  }

  const blocked = useMemo(() => new Set((jam?.doNotContact ?? []).map((d) => d.email)), [jam]);
  const list = (jam?.prospects ?? []).filter((p) => {
    if (filter === "opvolgen") return followUpDue(p, today);
    if (filter && p.status !== filter) return false;
    const s = q.toLowerCase();
    return !s || `${p.nr} ${p.bedrijf} ${p.gemeente} ${p.branche}`.toLowerCase().includes(s);
  });
  const next = jam ? pickBatch(jam.prospects, blocked) : [];
  const counts = (jam?.prospects ?? []).reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.status]: (acc[p.status] ?? 0) + 1 }), {});
  const contacted = (jam?.prospects ?? []).filter((p) => p.sentOn).length;
  const old = (jam?.prospects ?? []).filter((p) => expired(p, today)).length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Kicker>Prospectie</Kicker>
        <h1 className="mt-2 font-display text-5xl">Wie, wanneer, met welk haakje.</h1>
        <p className="mt-2 max-w-2xl text-mist text-pretty">{jam?.prospects.length ?? 0} prospecten, {contacted} gecontacteerd. Vandaag {jam?.sentToday ?? 0}/{jam?.settings.maxPerDay ?? 15} verzonden. Mails gaan alleen uit na goedkeuring door Kobe, op di-do tussen {jam?.settings.windowFrom ?? "08:30"} en {jam?.settings.windowUntil ?? "11:00"}.</p>
      </header>

      <Panel className="grid gap-3 md:grid-cols-3">
        <Field label="Prospectlijst (CSV, ; , UTF-8)">
          <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(async () => {
            const r = await importProspects({ data: { csv: await readFile(f) } });
            notice(`${r.added} nieuw, ${r.updated} bijgewerkt${r.errors.length ? `, ${r.errors.length} fouten: ${r.errors.slice(0, 3).join(" ")}` : ""}.`);
          }); }} />
        </Field>
        <Field label="Batch-JSON">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <TextInput value={batchNr} onChange={(e) => setBatchNr(e.target.value)} placeholder="Batch nr" />
              <TextInput type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} title="Verzonden op (leeg = nog niet verzonden)" />
            </div>
            <input type="file" accept=".json,application/json" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(async () => {
              const r = await importBatch({ data: { nr: Number(batchNr), json: await readFile(f), sentOn: batchDate } });
              notice(`Batch ${batchNr}: ${r.count} mails gekoppeld.`);
            }); }} />
          </div>
        </Field>
        <Field label="Niet-contacteren-lijst">
          <div className="flex gap-2">
            <TextInput value={dnc} onChange={(e) => setDnc(e.target.value)} placeholder="adres of @domein" />
            <Button disabled={busy} onClick={() => run(() => addDoNotContact({ data: { email: dnc, reason: "manueel" } }), "Toegevoegd.")}>Blokkeren</Button>
          </div>
          <p className="mt-1 text-xs text-mist">{jam?.doNotContact.length ?? 0} geblokkeerd{old ? ` · ${old} ouder dan 12 maanden` : ""}</p>
          {old > 0 && <Button variant="ghost" disabled={busy} onClick={() => { if (confirm(`${old} prospecten zonder reactie na 12 maanden wissen?`)) void run(() => purgeExpiredProspects(), "Gewist."); }}>Oude prospecten wissen</Button>}
        </Field>
      </Panel>

      <div className="flex flex-wrap gap-2 text-sm">
        <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="">Alle statussen</option>
          <option value="opvolgen">Opvolging nodig (7 werkdagen)</option>
          {PROSPECT_STATUSES.map((s) => <option key={s} value={s}>{s} ({counts[s] ?? 0})</option>)}
        </Select>
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek bedrijf, gemeente…" />
        <span className="self-center text-mist">Volgende batch (A, dan B, met e-mail): {next.map((p) => `#${p.nr}`).join(", ") || "—"}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs tracking-widest text-mist uppercase">
            <tr><th className="p-2">Nr</th><th className="p-2">Bedrijf</th><th className="p-2">Gemeente</th><th className="p-2">Prio</th><th className="p-2">Status</th><th className="p-2">Batch</th><th className="p-2">Verzonden</th></tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="cursor-pointer border-t border-line hover:bg-raised" onClick={() => { setOpen(p); setMail({ subject: "", body: `\n\n${UNSUBSCRIBE_LINE}` }); }}>
                <td className="p-2 tabular-nums">{p.nr}</td><td className="p-2">{p.bedrijf}</td><td className="p-2">{p.gemeente}</td>
                <td className="p-2">{p.prioriteit}</td><td className="p-2">{p.status}{blocked.has(p.email) ? " · geblokkeerd" : ""}</td>
                <td className="p-2">{p.batch ?? ""}</td><td className="p-2">{p.sentOn ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <p className="p-2 text-sm text-mist">Geen prospecten. Importeer de CSV hierboven.</p>}
      </div>

      {open && (
        <Panel className="flex flex-col gap-3">
          <Kicker>#{open.nr} {open.bedrijf}</Kicker>
          <p className="text-sm text-mist">{open.branche} · {open.gemeente} · {open.email || "geen e-mail (bellen/contactformulier)"} · {open.telefoon}</p>
          <p className="text-sm">Haakje: {open.haakje || "—"}</p>
          <p className="text-xs break-all text-mist">Bron (GDPR): {open.bron || "—"}</p>
          <div className="grid gap-2 md:grid-cols-3">
            <Field label="Naam rechtzetten"><TextInput defaultValue={open.bedrijf} id="p-name" /></Field>
            <Field label="Status">
              <Select defaultValue={open.status} id="p-status">{PROSPECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
            </Field>
            <Field label="Reden / notitie"><TextInput defaultValue={open.statusNote} id="p-note" /></Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => run(() => setProspect({ data: {
              nr: open.nr, status: (document.getElementById("p-status") as HTMLSelectElement).value,
              note: (document.getElementById("p-note") as HTMLInputElement).value, bedrijf: (document.getElementById("p-name") as HTMLInputElement).value,
            } }), "Prospect bijgewerkt.")}>Bewaren</Button>
            <Button variant="ghost" disabled={busy} onClick={() => run(async () => {
              const r = await createLeadProject({ data: { clientName: open.bedrijf, email: open.email, prospectNr: open.nr, contacts: open.telefoon } });
              notice(`Klant en project aangemaakt. API-sleutel van de projectbot (eenmalig): ${r.botKey}`);
              await refresh();
            })}>Positief: maak klant + project + projectbot</Button>
          </div>
          <div className="border-t border-line pt-3">
            <p className="text-sm">Mailconcept naar de goedkeuringswachtrij</p>
            <TextInput className="mt-2 w-full" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} placeholder="Onderwerp" />
            <Area className="mt-2 w-full" rows={8} value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} />
            <div className="mt-2 flex gap-2">
              <Button disabled={busy || !open.email} onClick={() => run(async () => {
                const kind = open.sentOn ? "opvolgmail" : "mail";
                const r = await newApproval({ data: { kind, prospectNr: open.nr, recipient: open.email, subject: mail.subject, body: mail.body } });
                notice(r.issues.length ? `In de wachtrij, met ${r.issues.length} waarschuwing(en).` : "In de wachtrij voor Kobe.");
              })}>{open.sentOn ? "Opvolgmail ter goedkeuring" : "Ter goedkeuring"}</Button>
              <Button variant="ghost" onClick={() => go("goedkeuring")}>Naar Goedkeuring</Button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
