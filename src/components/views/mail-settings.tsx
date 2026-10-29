import { useEffect, useState } from "react";
import { disconnectMail, loadMail, saveMail, startMailOAuth, testMail, type MailLogEntry, type MailStatus } from "@/lib/ops-mail";
import { MAIL_PROVIDERS, MAIL_PROVIDER_LABEL, type MailProvider } from "@/lib/mail-shared";
import { Button, Field, Panel, Select, TextInput } from "@/components/ui";

/** Beheer > Instellingen > Mailverbinding. Ook herbruikt op #setup. */
export function MailSettings({ notice, onChange }: { notice: (m: string) => void; onChange?: (s: MailStatus) => void }) {
  const [st, setSt] = useState<MailStatus | null>(null);
  const [log, setLog] = useState<MailLogEntry[]>([]);
  const [f, setF] = useState({ provider: "mailto" as MailProvider, fromAddress: "", fromName: "", smtpHost: "", smtpPort: 587, smtpUser: "", smtpSecure: false });
  const [busy, setBusy] = useState(false);

  async function reload() {
    const r = await loadMail();
    setSt(r.status); setLog(r.log); onChange?.(r.status);
    setF({ provider: r.status.provider, fromAddress: r.status.fromAddress, fromName: r.status.fromName, smtpHost: r.status.smtpHost, smtpPort: r.status.smtpPort, smtpUser: r.status.smtpUser, smtpSecure: r.status.smtpSecure });
  }
  useEffect(() => {
    reload().catch(() => {});
    const m = new URLSearchParams(window.location.search).get("mail");
    if (m) { notice(`Mailverbinding: ${m}`); history.replaceState(null, "", window.location.pathname + window.location.hash); }
  }, []);
  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try { const r = await fn(); if (ok) notice(ok); await reload(); return r; } catch (e) { notice(e instanceof Error ? e.message : "Mislukt."); } finally { setBusy(false); }
  }
  const oauth = f.provider === "outlook" || f.provider === "gmail";
  return (
    <section id="mail" className="flex flex-col gap-3">
      <h2 className="font-display text-3xl">Mailverbinding</h2>
      <p className="max-w-2xl text-sm text-mist text-pretty">
        Waarmee KADE facturen, offertes (met pdf) en goedgekeurde mails verstuurt. Zoho Mail gratis heeft geen SMTP/IMAP: kies dan "Mailprogramma" en Zoho zet je handtekening eronder. Niets vertrekt zonder Kobes goedkeuring.
      </p>
      <Panel className="grid max-w-3xl gap-3 md:grid-cols-2">
        <Field label="Provider">
          <Select value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value as MailProvider })}>
            {MAIL_PROVIDERS.map((p) => <option key={p} value={p}>{MAIL_PROVIDER_LABEL[p]}</option>)}
          </Select>
        </Field>
        <Field label="Afzenderadres"><TextInput value={f.fromAddress} onChange={(e) => setF({ ...f, fromAddress: e.target.value })} placeholder="info@jouwzaak.be" /></Field>
        <Field label="Afzendernaam"><TextInput value={f.fromName} onChange={(e) => setF({ ...f, fromName: e.target.value })} placeholder="JustAMinute" /></Field>
        {f.provider === "smtp" && <>
          <Field label="SMTP-server"><TextInput value={f.smtpHost} onChange={(e) => setF({ ...f, smtpHost: e.target.value })} placeholder="smtp.jouwprovider.be" /></Field>
          <Field label="Poort"><TextInput type="number" value={f.smtpPort} onChange={(e) => setF({ ...f, smtpPort: Number(e.target.value) })} /></Field>
          <Field label="Gebruiker"><TextInput value={f.smtpUser} onChange={(e) => setF({ ...f, smtpUser: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.smtpSecure} onChange={(e) => setF({ ...f, smtpSecure: e.target.checked })} /> TLS vanaf de start (poort 465)</label>
          <p className="text-xs text-mist md:col-span-2">Het SMTP-wachtwoord staat nooit in de app: zet het als env-variabele SMTP_PASSWORD op de server.</p>
        </>}
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button disabled={busy} onClick={() => run(() => saveMail({ data: f }), "Mailverbinding bewaard.")}>Bewaren</Button>
          {oauth && st?.provider === f.provider && <Button variant="ghost" disabled={busy} onClick={() => run(async () => { const r = await startMailOAuth(); if (r?.url) window.location.href = r.url; })}>{st.connected ? "Opnieuw verbinden" : "Verbinden"}</Button>}
          {oauth && st?.connected && st.provider === f.provider && <Button variant="ghost" disabled={busy} onClick={() => run(() => disconnectMail(), "Verbinding verbroken.")}>Verbreek</Button>}
          <Button variant="ghost" disabled={busy} onClick={() => run(async () => { const r = await testMail(); notice(r.message); })}>Test verbinding</Button>
        </div>
        {st && <div className="text-sm md:col-span-2">
          <p>Status: <b>{st.connected ? "verbonden" : "niet verbonden"}</b>{st.lastTestAt ? ` · laatste test ${new Date(st.lastTestAt).toLocaleString("nl-BE")} ${st.lastTestOk ? "geslaagd" : "mislukt"}` : ""}</p>
          {st.envMissing.length > 0 && <p className="text-brass">Ontbreekt op de server (env): {st.envMissing.join(", ")}</p>}
          {oauth && <p className="text-xs text-mist">Redirect-URI voor de app-registratie: <code>{st.redirectUri}</code></p>}
        </div>}
      </Panel>
      <h3 className="font-display text-xl">Verzonden mails</h3>
      {log.length === 0 ? <p className="text-sm text-mist">Nog niets verzonden via de mailverbinding.</p> : (
        <table className="w-full max-w-4xl text-sm">
          <thead><tr className="text-left text-xs text-mist uppercase"><th>Wanneer</th><th>Aan</th><th>Onderwerp</th><th>Bijlage</th><th>Via</th><th>Resultaat</th></tr></thead>
          <tbody>{log.map((l) => (
            <tr key={l.id} className="border-t border-line"><td>{new Date(l.createdAt).toLocaleString("nl-BE")}</td><td>{l.recipient}</td><td>{l.subject}</td><td>{l.attachment || "—"}</td><td>{l.provider}</td><td className={l.ok ? "" : "text-brass"}>{l.ok ? "ok" : l.detail}</td></tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}
