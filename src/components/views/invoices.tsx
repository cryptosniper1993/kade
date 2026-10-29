import { useEffect, useMemo, useState } from "react";
import { invoiceTotals } from "@/lib/finance";
import { euroLabel } from "@/lib/money";
import { createCreditNote, deleteDraftInvoice, getInvoiceUbl, saveClient, saveInvoice, sendInvoicePeppol, setInvoicePaid } from "@/lib/ops";
import { peppolIdFromKbo, peppolTotals } from "@/lib/peppol";
import { TREATMENT_LABEL, VAT_TREATMENTS, effectiveLines, invoiceProblems, legalMention, peppolRequired, type VatTreatment } from "@/lib/invoicing";
import type { Client, Desk, Invoice, InvoiceLine } from "@/lib/types";
import { Button, Field, Kicker, Panel, Select, TextInput } from "@/components/ui";

const blank = (): InvoiceLine => ({ description: "", qty: 1, unitExVat: 0, vatRate: 21 });

function mailAddress(client: Client): string {
  const line = [client.postalCode, client.city].filter(Boolean).join(" ");
  const country = client.country && client.country !== "België" ? client.country : "";
  return [client.address, line, country].filter(Boolean).join(", ");
}

function shift(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function InvoicesView({ desk, refresh, notice }: { desk: Desk; refresh: () => Promise<void>; notice: (m: string) => void }) {
  const first = desk.clients.find((client) => client.active) ?? desk.clients[0];
  const [clientId, setClientId] = useState(first?.id ?? "");
  const [clientName, setClientName] = useState(first?.name ?? "");
  const [clientVat, setClientVat] = useState(first?.vatNumber ?? "");
  const [clientAddress, setClientAddress] = useState(first ? mailAddress(first) : "");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(shift(new Date().toISOString().slice(0, 10), first?.payDays || 30));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([blank()]);
  const [editing, setEditing] = useState("");
  const [busy, setBusy] = useState(false);
  const [b2c, setB2c] = useState(false);
  const [treatment, setTreatment] = useState<VatTreatment>("standard");
  const [kind, setKind] = useState<"invoice" | "credit">("invoice");
  const exempt = desk.company?.vatRegime === "exempt";
  const shown = useMemo(() => effectiveLines(lines, treatment, exempt), [lines, treatment, exempt]);
  const totals = useMemo(() => invoiceTotals(shown), [shown]);
  const breakdown = useMemo(() => peppolTotals(lines, exempt, treatment).subtotals, [lines, exempt, treatment]);
  const mention = legalMention(treatment, exempt);
  const editingInvoice = desk.invoices.find((item) => item.id === editing);
  const warnings = invoiceProblems({ clientVat, b2c, issueDate, dueDate, lines, treatment, exempt }, true);
  const choices = desk.clients.filter((client) => client.active || client.id === clientId);

  function pickClient(id: string) {
    setClientId(id);
    const client = desk.clients.find((item) => item.id === id);
    if (!client) return;
    setClientName(client.name);
    setClientVat(client.vatNumber);
    setClientAddress(mailAddress(client));
    setDueDate(shift(issueDate, client.payDays || 30));
  }

  useEffect(() => {
    const stored = sessionStorage.getItem("kade-client");
    if (!stored) return;
    sessionStorage.removeItem("kade-client");
    pickClient(stored);
  }, []);

  useEffect(() => {
    // Geopend vanuit Offertes na "Werk gedaan → omzetten naar factuur".
    const wanted = sessionStorage.getItem("kade-invoice");
    if (!wanted) return;
    sessionStorage.removeItem("kade-invoice");
    const invoice = desk.invoices.find((item) => item.id === wanted);
    if (invoice && invoice.status === "draft") load(invoice);
  }, []);

  function patch(index: number, partial: Partial<InvoiceLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...partial } : line)));
  }

  function load(invoice: Invoice) {
    setEditing(invoice.id);
    setClientId(invoice.clientId ?? "");
    setClientName(invoice.clientName);
    setClientVat(invoice.clientVat);
    setClientAddress(invoice.clientAddress);
    setIssueDate(invoice.issueDate);
    setDueDate(invoice.dueDate);
    setNotes(invoice.notes);
    setLines(invoice.lines.length ? invoice.lines : [blank()]);
    setB2c(Boolean(invoice.b2c));
    setTreatment(invoice.vatTreatment ?? "standard");
    setKind(invoice.kind ?? "invoice");
  }

  function reset() {
    setEditing("");
    setLines([blank()]);
    setKind("invoice");
    setTreatment("standard");
  }

  async function persist(book: boolean, skipPeppol = ""): Promise<string> {
    setBusy(true);
    try {
      let id = clientId;
      if (!id && clientName) {
        const saved = await saveClient({ data: { id: "", name: clientName, vatNumber: clientVat, email: "", address: clientAddress, city: "" } });
        id = saved.id;
      }
      const saved = await saveInvoice({
        data: {
          id: editing,
          clientId: id,
          clientName,
          clientVat,
          clientAddress,
          issueDate,
          dueDate,
          notes,
          lines,
          book,
          b2c,
          treatment,
          skipPeppol,
        },
      });
      reset();
      await refresh();
      const label = kind === "credit" ? "Creditnota" : "Factuur";
      notice(book ? `${label} ${saved.number} uitgereikt en geboekt.` : "Concept bewaard. Het nummer volgt bij uitreiken.");
      return saved.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Factuur mislukt.";
      if (book && !skipPeppol && message.includes("PEPPOL_VERPLICHT")) {
        setBusy(false);
        const ok = window.confirm(
          "Deze klant is een Belgische btw-plichtige: sinds 1 januari 2026 moet de factuur via Peppol.\n\nOK = ik verstuur ze zelf via Peppol buiten Kade en wil enkel boeken.\nAnnuleren = terug, gebruik 'Factuur OK en stuur uit'.",
        );
        if (ok) return persist(true, "Buiten Kade via Peppol verstuurd (bevestigd door gebruiker).");
        notice("Niet geboekt. Gebruik 'Factuur OK en stuur uit' om via Peppol te versturen.");
        return "";
      }
      notice(message.replace("PEPPOL_VERPLICHT: ", ""));
      return "";
    } finally {
      setBusy(false);
    }
  }

  const client = desk.clients.find((item) => item.id === clientId);
  const receiver = client?.peppolId || peppolIdFromKbo(clientVat);

  async function downloadUbl(id: string) {
    try {
      const { filename, xml, problems } = await getInvoiceUbl({ data: { id } });
      const url = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      if (problems.length) notice(`UBL gedownload, maar nog niet Peppol-klaar: ${problems.join(" ")}`);
    } catch (error) {
      notice(error instanceof Error ? error.message : "UBL maken mislukt.");
    }
  }

  async function sendPeppol(id: string): Promise<void> {
    setBusy(true);
    try {
      const res = await sendInvoicePeppol({ data: { id } });
      await refresh();
      if (res.ok) return notice(res.message);
      notice(`${res.message} Download de UBL (knop "UBL") en bezorg ze op een andere afgesproken manier.`);
    } catch (error) {
      notice(error instanceof Error ? error.message : "Peppol-verzending mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function approveAndSend() {
    const to = receiver ? `via Peppol naar ${receiver}` : "zonder Peppol-ID (enkel boeken, daarna UBL downloaden)";
    if (!window.confirm(`Factuur definitief boeken en ${to} versturen? Een geboekte factuur kan je niet meer wijzigen.`)) return;
    const id = await persist(true, receiver ? "pending" : "");
    if (!id) return;
    if (!receiver) return notice("Factuur geboekt. De klant heeft geen Peppol-ID: download de UBL en bezorg ze op een afgesproken manier.");
    await sendPeppol(id);
  }

  async function pay(id: string) {
    try {
      await setInvoicePaid({ data: { id, paidOn: new Date().toISOString().slice(0, 10) } });
      await refresh();
      notice("Betaling geboekt op de bank.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Betaling mislukt.");
    }
  }

  async function remove(id: string) {
    try {
      await deleteDraftInvoice({ data: { id } });
      if (editing === id) reset();
      await refresh();
    } catch (error) {
      notice(error instanceof Error ? error.message : "Verwijderen mislukt.");
    }
  }

  async function credit(invoice: Invoice) {
    if (!window.confirm(`Creditnota maken op ${invoice.number}? Je krijgt een concept met dezelfde lijnen dat je kan aanpassen (bv. gedeeltelijk crediteren).`)) return;
    try {
      const res = await createCreditNote({ data: { id: invoice.id } });
      await refresh();
      load({ ...invoice, id: res.id, kind: "credit", number: "", status: "draft", notes: `Creditnota op factuur ${invoice.number} van ${invoice.issueDate}.` });
      notice("Concept-creditnota klaar. Pas de lijnen aan en reik ze uit.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Creditnota mislukt.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Kicker>Facturen</Kicker>
        <h1 className="mt-2 font-display text-5xl">Papier dat telt.</h1>
        <p className="mt-2 max-w-xl text-mist text-pretty">Een klant uit het bestand vult naam, btw, adres en vervaldag. Een losse naam wordt een nieuw bestand, zonder de rest van het dossier.</p>
      </header>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Panel className="flex flex-col gap-3">
          <Field label="Bestaande klant">
            <Select value={clientId} onChange={(e) => pickClient(e.target.value)}>
              <option value="">Nieuwe klant</option>
              {choices.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Klant"><TextInput value={clientName} onChange={(e) => setClientName(e.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Btw klant"><TextInput value={clientVat} onChange={(e) => setClientVat(e.target.value)} /></Field>
            <Field label="Adres"><TextInput value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} /></Field>
            <Field label="Datum"><TextInput type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></Field>
            <Field label="Vervaldag"><TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
            {!exempt && (
              <Field label="Btw-regeling">
                <Select value={treatment} onChange={(e) => setTreatment(e.target.value as VatTreatment)}>
                  {VAT_TREATMENTS.map((t) => (
                    <option key={t} value={t}>{TREATMENT_LABEL[t]}</option>
                  ))}
                </Select>
              </Field>
            )}
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={b2c} onChange={(e) => setB2c(e.target.checked)} />
              <span>Particulier (geen onderneming, geen btw-nummer nodig)</span>
            </label>
          </div>
          {kind === "credit" && <p className="text-sm text-amber-300">Je bewerkt een creditnota (reeks C-jaar). Ze wordt geboekt als tegenboeking van omzet en btw.</p>}
          {peppolRequired(clientVat, b2c) && <p className="text-xs text-mist">Belgische btw-plichtige klant: Peppol is verplicht sinds 1/1/2026.</p>}
          {warnings.length > 0 && (
            <ul className="text-xs text-red-400">
              {warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
          {lines.map((line, index) => (
            <div key={index} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-4">
              <label className="sm:col-span-2 text-sm">
                <span className="text-mist">Omschrijving</span>
                <TextInput className="mt-1" value={line.description} onChange={(e) => patch(index, { description: e.target.value })} />
              </label>
              <label className="text-sm">
                <span className="text-mist">Aantal</span>
                <TextInput className="mt-1" inputMode="decimal" value={String(line.qty)} onChange={(e) => patch(index, { qty: Number(e.target.value.replace(",", ".")) || 0 })} />
              </label>
              <label className="text-sm">
                <span className="text-mist">Prijs excl.</span>
                <TextInput className="mt-1" inputMode="decimal" value={String(line.unitExVat)} onChange={(e) => patch(index, { unitExVat: Number(e.target.value.replace(",", ".")) || 0 })} />
              </label>
              {!exempt && treatment === "standard" && (
                <label className="text-sm sm:col-span-2">
                  <span className="text-mist">Btw</span>
                  <Select className="mt-1" value={String(line.vatRate)} onChange={(e) => patch(index, { vatRate: Number(e.target.value) })}>
                    <option value="21">21%</option>
                    <option value="12">12%</option>
                    <option value="6">6%</option>
                    <option value="0">0%</option>
                  </Select>
                </label>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setLines((prev) => [...prev, blank()])}>Lijn</Button>
            <Button variant="ghost" disabled={busy} onClick={() => persist(false)}>Concept</Button>
            <Button variant="ghost" disabled={busy} onClick={() => persist(true)}>Enkel boeken</Button>
            <Button disabled={busy} onClick={approveAndSend}>{kind === "credit" ? "Creditnota OK en stuur uit" : "Factuur OK en stuur uit"}</Button>
            {editing && <Button variant="ghost" onClick={reset}>Nieuw</Button>}
          </div>
          <Field label="Nota">
            <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </Panel>
        <article className="invoice-sheet rounded-md bg-ivory p-6 text-ink sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-display text-4xl">{desk.company?.name || "Je zaak"}</p>
              <p className="mt-1 text-sm">{desk.company?.address} {desk.company?.city}</p>
              <p className="text-sm">Btw {desk.company?.vatNumber}</p>
              {desk.company?.enterpriseNumber && <p className="text-sm">Ondernemingsnr. {desk.company.enterpriseNumber}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs tracking-widest uppercase">{kind === "credit" ? "Creditnota" : "Factuur"}</p>
              <p className="mt-1 text-sm">{editingInvoice?.number || "Nummer bij uitreiken"}</p>
            </div>
          </div>
          <div className="mt-8 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs tracking-widest uppercase opacity-60">Aan</p>
              <p className="mt-1 font-medium">{clientName || "Klant"}</p>
              <p>{clientAddress}</p>
              <p>{b2c ? "Particulier" : clientVat ? `Btw ${clientVat}` : "Btw-nummer klant ontbreekt"}</p>
              {receiver && <p className="text-xs opacity-60">Peppol {receiver}</p>}
            </div>
            <div className="sm:text-right">
              <p>Datum {issueDate.split("-").reverse().join("/")}</p>
              <p>Vervaldag {dueDate.split("-").reverse().join("/")}</p>
              {kind === "invoice" && <p className="mt-2 tabular-nums">{editingInvoice?.ogm || "OGM bij uitreiken"}</p>}
            </div>
          </div>
          <table className="mt-8 w-full text-sm">
            <thead>
              <tr className="border-b border-ink/20 text-left">
                <th className="py-2 font-medium">Omschrijving</th>
                <th className="py-2 text-right font-medium">Aantal</th>
                <th className="py-2 text-right font-medium">Eenheidsprijs</th>
                <th className="py-2 text-right font-medium">Btw</th>
                <th className="py-2 text-right font-medium">Excl.</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index} className="border-b border-ink/10">
                  <td className="py-2">{line.description || "—"}</td>
                  <td className="py-2 text-right tabular-nums">{line.qty}</td>
                  <td className="py-2 text-right tabular-nums">{euroLabel(line.unitExVat)}</td>
                  <td className="py-2 text-right tabular-nums">{exempt ? "—" : treatment === "standard" ? `${line.vatRate}%` : "verlegd"}</td>
                  <td className="py-2 text-right tabular-nums">{euroLabel(line.qty * line.unitExVat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 ml-auto w-full max-w-xs text-sm">
            <p className="flex justify-between"><span>Excl. btw</span><span className="tabular-nums">{euroLabel(totals.ex)}</span></p>
            {breakdown.map((g) => (
              <p key={`${g.cat.id}${g.cat.percent}`} className="flex justify-between text-xs opacity-80">
                <span>{g.cat.id === "S" ? `Btw ${g.cat.percent}% op ${euroLabel(g.base)}` : `${g.cat.id === "Z" ? "0%" : g.cat.id} op ${euroLabel(g.base)}`}</span>
                <span className="tabular-nums">{euroLabel(g.tax)}</span>
              </p>
            ))}
            <p className="flex justify-between"><span>Btw</span><span className="tabular-nums">{euroLabel(totals.vat)}</span></p>
            <p className="mt-2 flex justify-between font-medium"><span>Totaal</span><span className="tabular-nums">{euroLabel(totals.incl)}</span></p>
          </div>
          {desk.company?.iban && kind === "invoice" && (
            <p className="mt-6 text-sm">Te betalen op {desk.company.iban} met vermelding {editingInvoice?.ogm || "(OGM bij uitreiken)"}.</p>
          )}
          {notes && <p className="mt-3 whitespace-pre-line text-sm">{notes}</p>}
          {mention && !notes.includes(mention) && <p className="mt-3 text-sm font-medium">{mention}</p>}
        </article>
      </div>
      <ul className="flex flex-col gap-2">
        {desk.invoices.length === 0 && <li className="text-sm text-mist">Nog geen factuur.</li>}
        {desk.invoices.map((invoice) => (
          <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line px-3 py-3 text-sm">
            <span>
              <span className="font-medium">{invoice.kind === "credit" ? "Creditnota " : ""}{invoice.number || "Concept"}</span>
              <span className="ml-2 text-mist">{invoice.clientName}</span>
              <span className="ml-2 text-mist">{invoice.status === "paid" ? "betaald" : invoice.status === "sent" ? "open" : "concept"}</span>
              {invoice.status !== "draft" && (
                <span className={`ml-2 ${invoice.peppolStatus === "fout" ? "text-red-400" : "text-mist"}`} title={invoice.peppolMessage}>
                  {invoice.peppolStatus === "verzonden" ? "· verzonden via Peppol" : invoice.peppolStatus === "fout" ? "· Peppol-fout" : "· niet via Peppol"}
                </span>
              )}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums text-mist">{invoice.kind === "credit" ? "−" : ""}{euroLabel(invoiceTotals(effectiveLines(invoice.lines, invoice.vatTreatment ?? "standard", exempt)).incl)}</span>
              {invoice.status === "draft" && <Button variant="ghost" onClick={() => load(invoice)}>Open</Button>}
              {invoice.status === "draft" && <Button variant="ghost" onClick={() => remove(invoice.id)}>Weg</Button>}
              {invoice.status === "sent" && <Button variant="ghost" onClick={() => pay(invoice.id)}>{invoice.kind === "credit" ? "Terugbetaald" : "Betaald"}</Button>}
              {invoice.status !== "draft" && invoice.kind !== "credit" && <Button variant="ghost" onClick={() => credit(invoice)}>Creditnota</Button>}
              {invoice.status !== "draft" && <Button variant="ghost" onClick={() => downloadUbl(invoice.id)}>UBL</Button>}
              {invoice.status !== "draft" && invoice.peppolStatus !== "verzonden" && (
                <Button variant="ghost" disabled={busy} onClick={() => sendPeppol(invoice.id)}>Verstuur via Peppol</Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
