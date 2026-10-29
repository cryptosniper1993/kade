import { useEffect, useRef, useState } from "react";
import { euroLabel } from "@/lib/money";
import { EXPENSE_ACCOUNTS } from "@/lib/accounts";
import {
  bookIncoming,
  deleteIncoming,
  getIncomingFile,
  linkIncomingSupplier,
  loadIncoming,
  markIncomingPaid,
  pollIncoming,
  setIncomingStatus,
  uploadIncoming,
} from "@/lib/ops-incoming";
import type { IncomingInvoice, IncomingStatus } from "@/lib/incoming";
import type { Desk } from "@/lib/types";
import { Button, Field, Kicker, Panel, Select, TextInput } from "@/components/ui";

const today = () => new Date().toISOString().slice(0, 10);
const nl = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");
const FILTERS: { id: "alle" | IncomingStatus; label: string }[] = [
  { id: "alle", label: "Alle" },
  { id: "nieuw", label: "Nieuw" },
  { id: "goedgekeurd", label: "Goedgekeurd" },
  { id: "betaald", label: "Betaald" },
  { id: "betwist", label: "Betwist" },
];

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function IncomingView({ desk, refresh, notice }: { desk: Desk; refresh: () => Promise<void>; notice: (m: string) => void }) {
  const [items, setItems] = useState<IncomingInvoice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<"alle" | IncomingStatus>("alle");
  const [openId, setOpenId] = useState("");
  const [account, setAccount] = useState("6400");
  const [paidOn, setPaidOn] = useState(today());
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const open = items.find((item) => item.id === openId) ?? null;
  const shown = items.filter((item) => filter === "alle" || item.status === filter);
  const openTotal = items.filter((i) => i.status === "nieuw" || i.status === "goedgekeurd").reduce((s, i) => s + (i.kind === "creditnote" ? -i.payable : i.payable), 0);

  async function reload() {
    try {
      setItems(await loadIncoming());
    } catch (error) {
      notice(error instanceof Error ? error.message : "Inkomende facturen laden mislukt.");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (!open) return;
    const supplier = desk.suppliers.find((s) => s.id === open.supplierId);
    setAccount(supplier?.account && supplier.account.startsWith("6") ? supplier.account : "6400");
    setPaidOn(today());
  }, [openId]);

  async function run(work: () => Promise<string | void>, after = false) {
    setBusy(true);
    try {
      const message = await work();
      await reload();
      if (after) await refresh();
      if (message) notice(message);
    } catch (error) {
      notice(error instanceof Error ? error.message : "Mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(list: FileList | null) {
    if (!list?.length) return;
    for (const f of Array.from(list)) {
      await run(async () => {
        const r = await uploadIncoming({ data: { xml: await f.text() } });
        setOpenId(r.id);
        return r.message;
      });
    }
    if (file.current) file.current.value = "";
  }

  async function fetchFile(item: IncomingInvoice, what: "pdf" | "xml") {
    try {
      const r = await getIncomingFile({ data: { id: item.id, what } });
      if ("base64" in r && r.base64) {
        const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
        download(r.filename, new Blob([bytes], { type: "application/pdf" }));
      } else if ("text" in r) {
        download(r.filename, new Blob([r.text ?? ""], { type: "application/xml" }));
      }
    } catch (error) {
      notice(error instanceof Error ? error.message : "Downloaden mislukt.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Kicker>Inkomende facturen</Kicker>
        <h1 className="mt-2 font-display text-5xl">Wat je zelf moet betalen.</h1>
        <p className="mt-2 max-w-xl text-mist text-pretty">Aankoopfacturen via Peppol of als UBL-bestand. Keur goed, boek als kost met btw-aftrek en markeer betaald.</p>
      </header>
      <Panel className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={() => run(async () => (await pollIncoming()).message, true)}>Ophalen via Peppol</Button>
        <Button variant="ghost" disabled={busy} onClick={() => file.current?.click()}>UBL XML opladen</Button>
        <input ref={file} type="file" accept=".xml,application/xml,text/xml" multiple className="hidden" onChange={(e) => onFile(e.target.files)} />
        <span className="ml-auto text-sm text-mist">Open te betalen: <span className="tabular-nums text-ivory">{euroLabel(openTotal)}</span></span>
      </Panel>
      <nav className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f.id} variant={filter === f.id ? "primary" : "ghost"} onClick={() => setFilter(f.id)}>
            {f.label} ({f.id === "alle" ? items.length : items.filter((i) => i.status === f.id).length})
          </Button>
        ))}
      </nav>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <ul className="flex flex-col gap-2">
          {loaded && shown.length === 0 && <li className="text-sm text-mist">Nog geen inkomende factuur.</li>}
          {shown.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setOpenId(item.id)}
                className={`flex w-full flex-col gap-1 rounded-sm border px-3 py-3 text-left text-sm ${item.id === openId ? "border-brass" : "border-line"}`}
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{item.supplierName}</span>
                    <span className="ml-2 text-mist">{item.kind === "creditnote" ? "Creditnota " : ""}{item.number}</span>
                    <span className="ml-2 rounded-sm bg-raised px-2 py-0.5 text-xs">{item.status}</span>
                  </span>
                  <span className="tabular-nums">{item.kind === "creditnote" ? "−" : ""}{euroLabel(item.payable)}</span>
                </span>
                <span className="text-xs text-mist">
                  {nl(item.issueDate)} · vervalt {nl(item.dueDate)} · {item.source === "peppol" ? "Peppol" : "upload"}
                  {item.booked ? " · geboekt" : ""}
                  {item.hasPdf ? " · PDF" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {open && (
          <Panel className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display text-2xl">{open.kind === "creditnote" ? "Creditnota" : "Factuur"} {open.number}</p>
              <span className="rounded-sm bg-raised px-2 py-0.5 text-xs">{open.status}</span>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-mist">Leverancier</dt><dd>{open.supplierName}</dd>
              <dt className="text-mist">Btw-nummer</dt><dd>{open.supplierVat || "—"}</dd>
              <dt className="text-mist">Peppol-ID</dt><dd>{open.supplierPeppolId || "—"}</dd>
              <dt className="text-mist">Adres</dt><dd>{open.supplierAddress || "—"}</dd>
              <dt className="text-mist">Datum</dt><dd>{nl(open.issueDate)}</dd>
              <dt className="text-mist">Vervaldatum</dt><dd>{nl(open.dueDate)}</dd>
              <dt className="text-mist">IBAN</dt><dd>{open.supplierIban || "—"}</dd>
              <dt className="text-mist">Mededeling</dt><dd>{open.paymentReference || "—"}</dd>
              <dt className="text-mist">Aan</dt><dd>{open.buyerName || "—"} {open.buyerPeppolId && `(${open.buyerPeppolId})`}</dd>
              {open.paidOn && (<><dt className="text-mist">Betaald op</dt><dd>{nl(open.paidOn)}</dd></>)}
            </dl>
            {open.notes && <p className="text-mist">{open.notes}</p>}
            <table className="w-full text-left">
              <thead className="text-xs text-mist"><tr><th>Omschrijving</th><th className="text-right">Aantal</th><th className="text-right">Prijs</th><th className="text-right">Btw</th><th className="text-right">Excl.</th></tr></thead>
              <tbody>
                {open.lines.map((l, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1">{l.description}</td>
                    <td className="text-right tabular-nums">{l.qty}</td>
                    <td className="text-right tabular-nums">{euroLabel(l.unitExVat)}</td>
                    <td className="text-right tabular-nums">{l.vatRate}%</td>
                    <td className="text-right tabular-nums">{euroLabel(l.netAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              {open.vat.map((v, i) => (
                <p key={i} className="flex justify-between text-mist"><span>Btw {v.rate}% ({v.category}) op {euroLabel(v.base)}</span><span className="tabular-nums">{euroLabel(v.tax)}</span></p>
              ))}
              <p className="flex justify-between"><span className="text-mist">Excl. btw</span><span className="tabular-nums">{euroLabel(open.totalExVat)}</span></p>
              <p className="flex justify-between"><span className="text-mist">Btw</span><span className="tabular-nums">{euroLabel(open.totalVat)}</span></p>
              <p className="flex justify-between font-medium"><span>Te betalen</span><span className="tabular-nums">{euroLabel(open.payable)}</span></p>
            </div>
            <Field label="Leverancier in Kade">
              <Select value={open.supplierId ?? ""} onChange={(e) => run(async () => { await linkIncomingSupplier({ data: { id: open.id, supplierId: e.target.value } }); return "Leverancier gekoppeld."; })}>
                <option value="">Niet gekoppeld</option>
                {desk.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2">
              {open.hasPdf && <Button variant="ghost" onClick={() => fetchFile(open, "pdf")}>PDF</Button>}
              <Button variant="ghost" onClick={() => fetchFile(open, "xml")}>UBL XML</Button>
              {open.status !== "goedgekeurd" && open.status !== "betaald" && (
                <Button variant="ghost" disabled={busy} onClick={() => run(async () => { await setIncomingStatus({ data: { id: open.id, status: "goedgekeurd" } }); return "Goedgekeurd."; })}>Goedkeuren</Button>
              )}
              {open.status !== "betwist" && open.status !== "betaald" && (
                <Button variant="ghost" disabled={busy} onClick={() => run(async () => { await setIncomingStatus({ data: { id: open.id, status: "betwist" } }); return "Op betwist gezet."; })}>Betwisten</Button>
              )}
              {open.status === "betwist" && (
                <Button variant="ghost" disabled={busy} onClick={() => run(async () => { await setIncomingStatus({ data: { id: open.id, status: "nieuw" } }); return "Terug op nieuw."; })}>Terug naar nieuw</Button>
              )}
              {!open.booked && (
                <Button variant="ghost" disabled={busy} onClick={() => run(async () => { await deleteIncoming({ data: { id: open.id } }); setOpenId(""); return "Verwijderd."; })}>Verwijderen</Button>
              )}
            </div>
            {!open.booked && open.status !== "betwist" && (
              <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
                <Field label="Kostenrekening">
                  <Select value={account} onChange={(e) => setAccount(e.target.value)}>
                    {EXPENSE_ACCOUNTS.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                  </Select>
                </Field>
                <Button disabled={busy} onClick={() => run(async () => { await bookIncoming({ data: { id: open.id, account } }); return "Geboekt als kost (btw-aftrek mee in de btw)."; }, true)}>Boeken als kost</Button>
              </div>
            )}
            {open.status !== "betaald" && open.status !== "betwist" && (
              <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
                <Field label="Betaald op"><TextInput type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></Field>
                <Button disabled={busy} onClick={() => run(async () => {
                  const r = await markIncomingPaid({ data: { id: open.id, date: paidOn } });
                  return r.booked ? "Betaald en betaling geboekt." : "Betaald. Tip: boek de factuur ook als kost.";
                }, true)}>Markeer betaald</Button>
              </div>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}
