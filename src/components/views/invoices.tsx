import { useEffect, useMemo, useState } from "react";
import { invoiceTotals, ogmFromSequence } from "@/lib/finance";
import { euroLabel } from "@/lib/money";
import { deleteDraftInvoice, saveClient, saveInvoice, setInvoicePaid } from "@/lib/ops";
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
  const exempt = desk.company?.vatRegime === "exempt";
  const totals = useMemo(() => invoiceTotals(lines, exempt), [lines, exempt]);
  const ogm = ogmFromSequence(desk.invoices.length + 1);
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
  }

  async function persist(book: boolean) {
    setBusy(true);
    try {
      let id = clientId;
      if (!id && clientName) {
        const saved = await saveClient({ data: { id: "", name: clientName, vatNumber: clientVat, email: "", address: clientAddress, city: "" } });
        id = saved.id;
      }
      await saveInvoice({
        data: {
          id: editing,
          clientId: id,
          clientName,
          clientVat,
          clientAddress,
          issueDate,
          dueDate,
          notes: exempt ? notes || "Vrijgesteld van btw, kleine onderneming." : notes,
          lines,
          book,
        },
      });
      setEditing("");
      setLines([blank()]);
      await refresh();
      notice(book ? "Factuur geboekt als vordering." : "Concept bewaard.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Factuur mislukt.");
    } finally {
      setBusy(false);
    }
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
    await deleteDraftInvoice({ data: id });
    if (editing === id) setEditing("");
    await refresh();
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
          </div>
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
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setLines((prev) => [...prev, blank()])}>Lijn</Button>
            <Button variant="ghost" disabled={busy} onClick={() => persist(false)}>Concept</Button>
            <Button disabled={busy} onClick={() => persist(true)}>Boeken en versturen</Button>
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
              <p className="text-sm">{desk.company?.vatNumber}</p>
            </div>
            <p className="text-right text-xs tracking-widest uppercase">Factuur</p>
          </div>
          <div className="mt-8 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs tracking-widest uppercase opacity-60">Aan</p>
              <p className="mt-1 font-medium">{clientName || "Klant"}</p>
              <p>{clientAddress}</p>
              <p>{clientVat}</p>
            </div>
            <div className="sm:text-right">
              <p>Datum {issueDate.split("-").reverse().join("/")}</p>
              <p>Vervaldag {dueDate.split("-").reverse().join("/")}</p>
              <p className="mt-2 tabular-nums">{ogm}</p>
            </div>
          </div>
          <table className="mt-8 w-full text-sm">
            <thead>
              <tr className="border-b border-ink/20 text-left">
                <th className="py-2 font-medium">Omschrijving</th>
                <th className="py-2 text-right font-medium">Excl.</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index} className="border-b border-ink/10">
                  <td className="py-2">{line.description || "—"}</td>
                  <td className="py-2 text-right tabular-nums">{euroLabel(line.qty * line.unitExVat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 ml-auto w-full max-w-xs text-sm">
            <p className="flex justify-between"><span>Excl. btw</span><span className="tabular-nums">{euroLabel(totals.ex)}</span></p>
            <p className="flex justify-between"><span>Btw</span><span className="tabular-nums">{euroLabel(totals.vat)}</span></p>
            <p className="mt-2 flex justify-between font-medium"><span>Totaal</span><span className="tabular-nums">{euroLabel(totals.incl)}</span></p>
          </div>
          {desk.company?.iban && <p className="mt-6 text-sm">Te betalen op {desk.company.iban} met vermelding {ogm}.</p>}
          {notes && <p className="mt-3 text-sm">{notes}</p>}
        </article>
      </div>
      <ul className="flex flex-col gap-2">
        {desk.invoices.length === 0 && <li className="text-sm text-mist">Nog geen factuur.</li>}
        {desk.invoices.map((invoice) => (
          <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line px-3 py-3 text-sm">
            <span>
              <span className="font-medium">{invoice.number}</span>
              <span className="ml-2 text-mist">{invoice.clientName}</span>
              <span className="ml-2 text-mist">{invoice.status === "paid" ? "betaald" : invoice.status === "sent" ? "open" : "concept"}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums text-mist">{euroLabel(invoiceTotals(invoice.lines, exempt).incl)}</span>
              {invoice.status === "draft" && <Button variant="ghost" onClick={() => load(invoice)}>Open</Button>}
              {invoice.status === "draft" && <Button variant="ghost" onClick={() => remove(invoice.id)}>Weg</Button>}
              {invoice.status === "sent" && <Button variant="ghost" onClick={() => pay(invoice.id)}>Betaald</Button>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
