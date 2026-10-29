import { useEffect, useState } from "react";
import { decideApproval, loadJam, markApprovalSent, type Approval } from "@/lib/ops-jam";
import { plainify } from "@/lib/outreach";
import { approvalEml, listMailableDocs, sendApprovalMail } from "@/lib/ops-mail";
import { newApproval } from "@/lib/ops-jam";
import { Field } from "@/components/ui";
import { Area, Button, Kicker, Panel, Select, TextInput } from "@/components/ui";

type Jam = Awaited<ReturnType<typeof loadJam>>;

function mailto(a: Approval): string {
  return `mailto:${encodeURIComponent(a.recipient)}?subject=${encodeURIComponent(a.subject)}&body=${encodeURIComponent(a.body)}`;
}

/** Eén wachtrij voor mails, opvolgmails, offertes en posts. Alleen Kobe keurt goed, wijzigt of weigert. */
export function ApprovalsView({ notice }: { notice: (m: string) => void }) {
  const [jam, setJam] = useState<Jam | null>(null);
  const [status, setStatus] = useState("wacht_goedkeuring");
  const [edit, setEdit] = useState<Record<string, { subject: string; body: string }>>({});
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const [docs, setDocs] = useState<Awaited<ReturnType<typeof listMailableDocs>>>([]);
  const [doc, setDoc] = useState({ key: "", recipient: "", subject: "", body: "" });
  async function load() { setJam(await loadJam()); }
  useEffect(() => { load().catch(() => notice("Wachtrij laden mislukt.")); listMailableDocs().then(setDocs).catch(() => {}); }, []);
  async function eml(id: string) {
    const r = await approvalEml({ data: { id } });
    const url = URL.createObjectURL(new Blob([r.eml], { type: "message/rfc822" }));
    const el = document.createElement("a"); el.href = url; el.download = r.filename; el.click(); URL.revokeObjectURL(url);
  }
  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try { await fn(); if (ok) notice(ok); await load(); } catch (e) { notice(e instanceof Error ? e.message : "Mislukt."); } finally { setBusy(false); }
  }

  const items = (jam?.approvals ?? []).filter((a) => !status || a.status === status);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Kicker>Goedkeuring</Kicker>
        <h1 className="mt-2 font-display text-5xl">Niets gaat buiten zonder Kobe.</h1>
        <p className="mt-2 max-w-2xl text-mist text-pretty">Bots en KADE maken concepten. Kobe keurt goed, wijzigt of weigert. Pas daarna kan een item verzonden worden: via je mailprogramma (Zoho heeft geen SMTP op het gratis plan) en daarna "Markeer als verzonden".</p>
      </header>
      <Select value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="wacht_goedkeuring">Wacht op goedkeuring</option>
        <option value="goedgekeurd">Goedgekeurd</option>
        <option value="gewijzigd">Gewijzigd en goedgekeurd</option>
        <option value="geweigerd">Geweigerd</option>
        <option value="verzonden">Verzonden</option>
        <option value="">Alles</option>
      </Select>
      <Panel className="grid max-w-3xl gap-3 md:grid-cols-2">
        <p className="text-sm md:col-span-2"><b>Factuur of offerte mailen</b>: zet een mail met de pdf als bijlage in de wachtrij.</p>
        <Field label="Document">
          <Select value={doc.key} onChange={(e) => {
            const d = docs.find((x) => `${x.kind}:${x.id}` === e.target.value);
            setDoc(d ? { key: e.target.value, recipient: d.email, subject: `${d.kind === "factuur" ? "Factuur" : "Offerte"} ${d.number}`, body: `Goedemiddag,\n\nIn bijlage vindt u ${d.kind === "factuur" ? "factuur" : "offerte"} ${d.number}.\n\nMet vriendelijke groet` } : { key: "", recipient: "", subject: "", body: "" });
          }}>
            <option value="">Kies…</option>
            {docs.map((d) => <option key={`${d.kind}:${d.id}`} value={`${d.kind}:${d.id}`}>{d.kind} {d.number} · {d.client}</option>)}
          </Select>
        </Field>
        <Field label="Aan"><TextInput value={doc.recipient} onChange={(e) => setDoc({ ...doc, recipient: e.target.value })} placeholder="klant@voorbeeld.be" /></Field>
        <div className="md:col-span-2"><TextInput value={doc.subject} onChange={(e) => setDoc({ ...doc, subject: e.target.value })} placeholder="Onderwerp" /></div>
        <div className="md:col-span-2"><Area rows={4} value={doc.body} onChange={(e) => setDoc({ ...doc, body: e.target.value })} /></div>
        <div><Button disabled={busy || !doc.key} onClick={() => run(async () => {
          const [kind, id] = doc.key.split(":");
          await newApproval({ data: { kind, recipient: doc.recipient, subject: doc.subject, body: doc.body, quoteId: kind === "offerte" ? id : null, invoiceId: kind === "factuur" ? id : null } });
          setDoc({ key: "", recipient: "", subject: "", body: "" });
        }, "Mail met pdf staat in de wachtrij.")}>Ter goedkeuring</Button></div>
      </Panel>
      {items.length === 0 && <p className="text-sm text-mist">Niets in deze lijst.</p>}
      {items.map((a) => {
        const e = edit[a.id] ?? { subject: a.subject, body: a.body };
        const open = a.status === "wacht_goedkeuring";
        const ready = a.status === "goedgekeurd" || a.status === "gewijzigd";
        return (
          <Panel key={a.id} className="flex flex-col gap-2">
            <p className="text-xs tracking-widest text-mist uppercase">{a.kind} · {a.status} · door {a.createdBy}{a.prospectNr != null ? ` · prospect #${a.prospectNr}` : ""} · {new Date(a.createdAt).toLocaleString("nl-BE")}</p>
            <p className="text-sm">Aan: {a.recipient || "—"}</p>
            {a.issues.length > 0 && (
              <ul className="text-sm text-brass">{a.issues.map((i, n) => <li key={n}>⚠ {i.detail}</li>)}</ul>
            )}
            <TextInput value={e.subject} disabled={!open} onChange={(ev) => setEdit({ ...edit, [a.id]: { ...e, subject: ev.target.value } })} />
            <Area rows={8} value={e.body} disabled={!open} onChange={(ev) => setEdit({ ...edit, [a.id]: { ...e, body: ev.target.value } })} />
            <div className="flex flex-wrap gap-2">
              {open && <>
                <Button variant="ghost" disabled={busy} onClick={() => setEdit({ ...edit, [a.id]: { subject: plainify(e.subject), body: plainify(e.body) } })}>Platte tekens</Button>
                <Button disabled={busy} onClick={() => run(async () => {
                  const changed = e.body !== a.body || e.subject !== a.subject;
                  const r = await decideApproval({ data: { id: a.id, decision: changed ? "wijzigen" : "goedkeuren", body: e.body, subject: e.subject } });
                  if (r.token) setTokens({ ...tokens, [a.id]: r.token });
                }, "Goedgekeurd door Kobe.")}>Goedkeuren</Button>
                <Button variant="ghost" disabled={busy} onClick={() => run(() => decideApproval({ data: { id: a.id, decision: "weigeren" } }), "Geweigerd.")}>Weigeren</Button>
              </>}
              {ready && <>
                {!tokens[a.id] && <Button variant="ghost" disabled={busy} onClick={() => run(async () => {
                  const r = await decideApproval({ data: { id: a.id, decision: "goedkeuren" } });
                  if (r.token) setTokens({ ...tokens, [a.id]: r.token });
                }, "Opnieuw bevestigd door Kobe.")}>Bevestig opnieuw</Button>}
                {a.recipient && <a className="inline-flex min-h-11 items-center rounded-sm border border-line px-4 text-sm hover:border-brass" href={mailto(a)}>Open in mailprogramma</a>}
                {a.recipient && <Button variant="ghost" disabled={busy} onClick={() => run(() => eml(a.id))}>Download .eml{a.quoteId || a.invoiceId ? " (met pdf)" : ""}</Button>}
                <Button disabled={busy || !tokens[a.id]} onClick={() => run(async () => { const r = await sendApprovalMail({ data: { id: a.id, token: tokens[a.id] } }); notice(r.message); })}>Verzend via mailverbinding</Button>
                <Button variant="ghost" disabled={busy || !tokens[a.id]}
                  onClick={() => run(() => markApprovalSent({ data: { id: a.id, token: tokens[a.id] } }), "Gemarkeerd als verzonden.")}>Markeer als verzonden</Button>
              </>}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
