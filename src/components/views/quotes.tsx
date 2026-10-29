import { useEffect, useMemo, useState } from "react";
import { euroLabel } from "@/lib/money";
import { convertQuoteToInvoice, deleteConceptQuote, loadQuotes, saveQuote, setQuoteStatus } from "@/lib/ops-quotes";
import { quoteTotals, type Quote, type QuoteStatus } from "@/lib/quotes";
import type { Client, Desk, InvoiceLine } from "@/lib/types";
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

const today = () => new Date().toISOString().slice(0, 10);

export function QuotesView({
  desk,
  refresh,
  notice,
  go,
}: {
  desk: Desk;
  refresh: () => Promise<void>;
  notice: (m: string) => void;
  go: (id: string) => void;
}) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientVat, setClientVat] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [validUntil, setValidUntil] = useState(shift(today(), 30));
  const [notes, setNotes] = useState("");
  const [projectId, setProjectId] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const exempt = desk.company?.vatRegime === "exempt";
  const totals = useMemo(() => quoteTotals(lines, exempt), [lines, exempt]);
  const choices = desk.clients.filter((client) => client.active || client.id === clientId);
  const projects = desk.projects ?? [];

  async function reload() {
    try {
      setQuotes(await loadQuotes());
    } catch (error) {
      notice(error instanceof Error ? error.message : "Offertes laden mislukt.");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  function pickClient(id: string) {
    setClientId(id);
    const client = desk.clients.find((item) => item.id === id);
    if (!client) return;
    setClientName(client.name);
    setClientVat(client.vatNumber);
    setClientAddress(mailAddress(client));
  }

  function reset() {
    setEditing("");
    setClientId("");
    setClientName("");
    setClientVat("");
    setClientAddress("");
    setIssueDate(today());
    setValidUntil(shift(today(), 30));
    setNotes("");
    setProjectId("");
    setLines([blank()]);
  }

  function load(quote: Quote) {
    setEditing(quote.id);
    setClientId(quote.clientId ?? "");
    setClientName(quote.clientName);
    setClientVat(quote.clientVat);
    setClientAddress(quote.clientAddress);
    setIssueDate(quote.issueDate);
    setValidUntil(quote.validUntil);
    setNotes(quote.notes);
    setProjectId(quote.projectId ?? "");
    setLines(quote.lines.length ? quote.lines : [blank()]);
  }

  function patch(index: number, partial: Partial<InvoiceLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...partial } : line)));
  }

  async function persist() {
    setBusy(true);
    try {
      await saveQuote({
        data: { id: editing, clientId: clientId || null, clientName, clientVat, clientAddress, issueDate, validUntil, notes, lines, projectId: projectId || null },
      });
      reset();
      await reload();
      notice("Offerte bewaard.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Offerte bewaren mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, status: QuoteStatus) {
    try {
      await setQuoteStatus({ data: { id, status } });
      await reload();
      notice(`Offerte ${status}.`);
    } catch (error) {
      notice(error instanceof Error ? error.message : "Status wijzigen mislukt.");
    }
  }

  async function remove(id: string) {
    await deleteConceptQuote({ data: id });
    if (editing === id) reset();
    await reload();
  }

  async function convert(quote: Quote) {
    setBusy(true);
    try {
      const result = await convertQuoteToInvoice({ data: quote.id });
      await reload();
      await refresh();
      sessionStorage.setItem("kade-invoice", result.invoiceId);
      notice(`Conceptfactuur ${result.number} gemaakt uit ${quote.number}.`);
      go("facturen");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Omzetten mislukt.");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  function invoiceNumber(id: string | null) {
    return desk.invoices.find((invoice) => invoice.id === id)?.number ?? "";
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Kicker>Offertes</Kicker>
        <h1 className="mt-2 font-display text-5xl">Eerst akkoord, dan werk.</h1>
        <p className="mt-2 max-w-xl text-mist text-pretty">Maak een offerte, stuur ze uit en zet ze na goedkeuring en gedaan werk in één klik om naar een conceptfactuur.</p>
      </header>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Panel className="flex flex-col gap-3">
          <p className="text-sm text-mist">{editing ? `Offerte ${quotes.find((q) => q.id === editing)?.number ?? ""} bewerken` : "Nieuwe offerte"}</p>
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
            <Field label="Geldig tot"><TextInput type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></Field>
          </div>
          <Field label="Project (optioneel)">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Geen project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </Select>
          </Field>
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
              {!exempt && (
                <label className="text-sm sm:col-span-2">
                  <span className="text-mist">Btw</span>
                  <Select className="mt-1" value={String(line.vatRate)} onChange={(e) => patch(index, { vatRate: Number(e.target.value) })}>
                    <option value="21">21%</option>
                    <option value="6">6%</option>
                    <option value="0">0%</option>
                  </Select>
                </label>
              )}
            </div>
          ))}
          <Field label="Nota"><TextInput value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <div className="text-sm">
            <p className="flex justify-between"><span className="text-mist">Excl. btw</span><span className="tabular-nums">{euroLabel(totals.ex)}</span></p>
            <p className="flex justify-between"><span className="text-mist">Btw</span><span className="tabular-nums">{euroLabel(totals.vat)}</span></p>
            <p className="flex justify-between font-medium"><span>Totaal</span><span className="tabular-nums">{euroLabel(totals.incl)}</span></p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setLines((prev) => [...prev, blank()])}>Lijn</Button>
            <Button disabled={busy} onClick={() => persist()}>Offerte bewaren</Button>
            {editing && <Button variant="ghost" onClick={reset}>Nieuw</Button>}
          </div>
        </Panel>
        <ul className="flex flex-col gap-2">
          {loaded && quotes.length === 0 && <li className="text-sm text-mist">Nog geen offerte.</li>}
          {quotes.map((quote) => (
            <li key={quote.id} className="flex flex-col gap-2 rounded-sm border border-line px-3 py-3 text-sm">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{quote.number}</span>
                  <span className="ml-2 text-mist">{quote.clientName}</span>
                  <span className="ml-2 rounded-sm bg-raised px-2 py-0.5 text-xs">{quote.status}</span>
                </span>
                <span className="tabular-nums text-mist">{euroLabel(quoteTotals(quote.lines, exempt).incl)}</span>
              </span>
              <span className="text-xs text-mist">
                Geldig tot {quote.validUntil.split("-").reverse().join("/")}
                {quote.projectId && ` · project ${projects.find((p) => p.id === quote.projectId)?.name ?? ""}`}
                {quote.invoiceId && ` · factuur ${invoiceNumber(quote.invoiceId)}`}
              </span>
              <span className="flex flex-wrap gap-2">
                {quote.status !== "gefactureerd" && <Button variant="ghost" onClick={() => load(quote)}>Open</Button>}
                {(quote.status === "concept" || quote.status === "afgewezen") && <Button variant="ghost" onClick={() => move(quote.id, "verstuurd")}>Verstuurd</Button>}
                {(quote.status === "concept" || quote.status === "verstuurd") && <Button variant="ghost" onClick={() => move(quote.id, "goedgekeurd")}>Goedgekeurd</Button>}
                {(quote.status === "concept" || quote.status === "verstuurd" || quote.status === "goedgekeurd") && <Button variant="ghost" onClick={() => move(quote.id, "afgewezen")}>Afgewezen</Button>}
                {quote.status === "concept" && <Button variant="ghost" onClick={() => remove(quote.id)}>Weg</Button>}
                {quote.status === "goedgekeurd" && !quote.invoiceId && (
                  <Button disabled={busy} onClick={() => convert(quote)}>Werk gedaan → omzetten naar factuur</Button>
                )}
                {quote.invoiceId && (
                  <Button variant="ghost" onClick={() => { sessionStorage.setItem("kade-invoice", quote.invoiceId ?? ""); go("facturen"); }}>Naar factuur</Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
