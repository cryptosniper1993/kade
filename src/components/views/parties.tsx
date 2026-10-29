import { useMemo, useState } from "react";
import { EXPENSE_ACCOUNTS } from "@/lib/accounts";
import { formatDay } from "@/lib/day";
import { invoiceTotals } from "@/lib/finance";
import { euroLabel } from "@/lib/money";
import { lookupPeppol } from "@/lib/ops";
import { peppolIdFromKbo } from "@/lib/peppol";
import { deleteParty, postEntry, saveClient, saveDocument, saveSupplier, setPartyActive } from "@/lib/ops";
import type { Client, Desk, Supplier } from "@/lib/types";
import { Button, Field, Kicker, Panel, Select, TextInput, Area } from "@/components/ui";

type Kind = "client" | "supplier";

const blank = {
  id: "",
  name: "",
  vatNumber: "",
  email: "",
  phone: "",
  contact: "",
  address: "",
  postalCode: "",
  city: "",
  country: "België",
  payDays: "30",
  iban: "",
  account: "6400",
  note: "",
  active: true,
  peppolId: "",
};

function place(party: Client): string {
  const line = [party.postalCode, party.city].filter(Boolean).join(" ");
  const country = party.country && party.country !== "België" ? party.country : "";
  return [party.address, line, country].filter(Boolean).join(", ");
}

export function PartiesView({
  kind,
  desk,
  go,
  refresh,
  notice,
}: {
  kind: Kind;
  desk: Desk;
  go: (id: string) => void;
  refresh: () => Promise<void>;
  notice: (m: string) => void;
}) {
  const list = kind === "client" ? desk.clients : desk.suppliers;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(list[0]?.id ?? "");
  const [form, setForm] = useState<typeof blank | null>(null);
  const [busy, setBusy] = useState("");
  const [cost, setCost] = useState("");
  const [costDate, setCostDate] = useState(new Date().toISOString().slice(0, 10));
  const [paid, setPaid] = useState(true);
  const party = list.find((item) => item.id === selected) ?? null;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((item) => !q || `${item.name} ${item.city} ${item.vatNumber}`.toLowerCase().includes(q));
  }, [list, query]);

  function edit(item: Client | Supplier) {
    setSelected(item.id);
    setForm({
      id: item.id,
      name: item.name,
      vatNumber: item.vatNumber,
      email: item.email,
      phone: item.phone,
      contact: item.contact,
      address: item.address,
      postalCode: item.postalCode,
      city: item.city,
      country: item.country || "België",
      payDays: String(item.payDays),
      iban: item.iban,
      account: "account" in item ? item.account : "6400",
      note: item.note,
      active: item.active,
      peppolId: item.peppolId,
    });
  }

  async function save() {
    if (!form) return;
    setBusy("save");
    try {
      const payload = { ...form, payDays: Number(form.payDays) || 30 };
      const saved = kind === "client"
        ? await saveClient({ data: payload })
        : await saveSupplier({ data: payload });
      setForm(null);
      setSelected(saved.id);
      await refresh();
      notice("Bestand bijgewerkt.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Bewaren lukte niet.");
    } finally {
      setBusy("");
    }
  }

  async function upload(file: File) {
    if (!party) return;
    if (file.size > 700_000) return notice("Houd het bestand onder 700 KB.");
    setBusy("file");
    try {
      const dataUrl = await readFile(file);
      await saveDocument({
        data: {
          filename: file.name,
          mime: file.type || "application/pdf",
          dataUrl,
          kind: kind === "client" ? "contract" : "aankoopfactuur",
          vendor: party.name,
          docDate: new Date().toISOString().slice(0, 10),
          amountEur: null,
          note: "",
          clientId: kind === "client" ? party.id : "",
          supplierId: kind === "supplier" ? party.id : "",
        },
      });
      await refresh();
      notice("Stuk aan het bestand gehangen.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Opladen mislukt.");
    } finally {
      setBusy("");
    }
  }

  async function bookCost() {
    if (!party || kind !== "supplier" || !("account" in party)) return;
    const amount = Number(cost.replace(",", "."));
    if (!amount) return notice("Zet een bedrag.");
    setBusy("cost");
    try {
      await postEntry({
        data: {
          kind: "expense",
          date: costDate,
          memo: party.name,
          account: party.account,
          amountEx: amount,
          vatRate: desk.company?.vatRegime === "exempt" ? 0 : 21,
          paid,
          supplierId: party.id,
        },
      });
      setCost("");
      await refresh();
      notice(paid ? "Kost geboekt en betaald van de bank." : "Kost geboekt als schuld.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Boeken lukte niet.");
    } finally {
      setBusy("");
    }
  }

  const invoices = party && kind === "client"
    ? desk.invoices.filter((invoice) => invoice.clientId === party.id || invoice.clientName === party.name)
    : [];
  const open = invoices.filter((invoice) => invoice.status === "sent");
  const docs = desk.documents.filter((doc) => (kind === "client" ? doc.clientId === party?.id : doc.supplierId === party?.id));
  const bills = party && kind === "supplier"
    ? desk.journals.filter((journal) => journal.supplierId === party.id)
    : [];
  const projects = party && kind === "client"
    ? desk.projects.filter((project) => project.clientName.trim().toLowerCase() === party.name.trim().toLowerCase())
    : [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Kicker>Finance · {kind === "client" ? "Klanten" : "Leveranciers"}</Kicker>
          <h1 className="mt-2 font-display text-5xl">{kind === "client" ? "Wie je factureert." : "Wie jou factureert."}</h1>
          <p className="mt-2 max-w-xl text-mist text-pretty">
            {kind === "client"
              ? "Het bestand vult de factuur: naam, btw, adres en betalingstermijn. Wat je verstuurt, blijft aan deze klant hangen."
              : "Het bestand houdt bij van wie je koopt, op welke rekening, en welke aankoopfactuur erbij hoort."}
          </p>
        </div>
        <Button onClick={() => { setForm({ ...blank }); setSelected(""); }}>Nieuw</Button>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
          <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek op naam, plaats of btw" />
          {shown.length === 0 && <p className="text-sm text-mist">Niemand in dit bestand.</p>}
          {shown.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setSelected(item.id); setForm(null); }}
              className={`rounded-sm border px-3 py-3 text-left ${selected === item.id ? "border-brass" : "border-line"}`}
            >
              <span className="block font-medium">{item.name}</span>
              <span className="block text-sm text-mist">{[item.city, item.vatNumber].filter(Boolean).join(" · ") || "Geen btw-nummer"}{item.active ? "" : " · non-actief"}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-4 lg:col-span-2">
          {form && (
            <Panel className="grid gap-3 sm:grid-cols-2">
              <Field label="Naam"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Btw-nummer"><TextInput value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} placeholder="BE0123456789" /></Field>
              {kind === "client" && (
                <Field label="Peppol-ID">
                  <div className="flex gap-2">
                    <TextInput value={form.peppolId} onChange={(e) => setForm({ ...form, peppolId: e.target.value })} placeholder={peppolIdFromKbo(form.vatNumber) || "0208:0123456789"} />
                    <Button variant="ghost" disabled={busy === "peppol"} onClick={async () => {
                      const id = form.peppolId.trim() || peppolIdFromKbo(form.vatNumber);
                      setBusy("peppol");
                      try { notice((await lookupPeppol({ data: { peppolId: id } })).message); } finally { setBusy(""); }
                    }}>Peppol-ontvanger?</Button>
                  </div>
                </Field>
              )}
              <Field label="Contact"><TextInput value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
              <Field label="E-mail"><TextInput value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Telefoon"><TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="Betalingstermijn, dagen"><TextInput inputMode="numeric" value={form.payDays} onChange={(e) => setForm({ ...form, payDays: e.target.value })} /></Field>
              <div className="sm:col-span-2">
                <Field label="Adres"><TextInput value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
              </div>
              <Field label="Postcode"><TextInput value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} /></Field>
              <Field label="Plaats"><TextInput value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
              <Field label="Land"><TextInput value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></Field>
              <Field label="IBAN"><TextInput value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} /></Field>
              {kind === "supplier" && (
                <Field label="Kostenrekening">
                  <Select value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })}>
                    {EXPENSE_ACCOUNTS.map((account) => (
                      <option key={account.code} value={account.code}>{account.code} {account.name}</option>
                    ))}
                  </Select>
                </Field>
              )}
              <div className="sm:col-span-2">
                <Field label="Nota"><Area value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Actief
              </label>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button disabled={busy === "save"} onClick={save}>{busy === "save" ? "Bewaren…" : "Bewaren"}</Button>
                <Button variant="ghost" onClick={() => setForm(null)}>Sluiten</Button>
              </div>
            </Panel>
          )}

          {!form && party && (
            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs tracking-widest text-brass uppercase">{party.active ? "Actief" : "Non-actief"} · {party.payDays} dagen</p>
                  <h2 className="mt-1 font-display text-4xl">{party.name}</h2>
                  <p className="mt-2 text-sm text-mist">{place(party) || "Geen adres"}</p>
                  <p className="text-sm text-mist">{[party.vatNumber, party.contact, party.email, party.phone].filter(Boolean).join(" · ") || "Geen contact"}</p>
                  {party.iban && <p className="mt-1 text-sm tabular-nums">{party.iban}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {kind === "client" && (
                    <Button onClick={() => { sessionStorage.setItem("kade-client", party.id); go("facturen"); }}>Factuur</Button>
                  )}
                  <Button variant="ghost" onClick={() => edit(party)}>Wijzig</Button>
                  <Button variant="ghost" onClick={async () => { await setPartyActive({ data: { id: party.id, kind: kind === "client" ? "client" : "supplier", active: !party.active } }); await refresh(); }}>
                    {party.active ? "Non-actief" : "Actief"}
                  </Button>
                  <Button variant="ghost" onClick={async () => {
                    try {
                      await deleteParty({ data: { id: party.id, kind: kind === "client" ? "client" : "supplier" } });
                      setSelected("");
                      await refresh();
                    } catch (error) {
                      notice(error instanceof Error ? error.message : "Weghalen lukte niet.");
                    }
                  }}>Weg</Button>
                </div>
              </div>
              {party.note && <p className="mt-4 text-sm text-pretty">{party.note}</p>}
              {kind === "supplier" && (
                <p className="mt-3 text-sm text-mist">Kosten gaan standaard naar {(party as Supplier).account}.</p>
              )}
            </Panel>
          )}

          {!form && !party && <p className="text-sm text-mist">Kies iemand, of maak een nieuw bestand.</p>}

          {party && kind === "client" && (
            <Panel>
              <div className="flex items-baseline justify-between gap-3">
                <Kicker>Facturen</Kicker>
                <p className="text-sm text-mist">{open.length} open · {euroLabel(open.reduce((sum, invoice) => sum + invoiceTotals(invoice.lines, desk.company?.vatRegime === "exempt").incl, 0))}</p>
              </div>
              {invoices.length === 0 ? <p className="mt-3 text-sm text-mist">Nog geen factuur voor deze klant.</p> : (
                <ul className="mt-3 divide-y divide-line">
                  {invoices.map((invoice) => (
                    <li key={invoice.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                      <span>{invoice.number} · {invoice.status === "paid" ? "betaald" : invoice.status === "sent" ? "open" : "concept"}</span>
                      <span className="tabular-nums text-mist">{formatDay(invoice.issueDate)} · {euroLabel(invoiceTotals(invoice.lines, desk.company?.vatRegime === "exempt").incl)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {projects.length > 0 && (
                <p className="mt-3 text-sm text-mist">Projecten: {projects.map((project) => project.name).join(", ")}.</p>
              )}
            </Panel>
          )}

          {party && kind === "supplier" && (
            <Panel>
              <Kicker>Kosten</Kicker>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Bedrag excl."><TextInput inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
                <Field label="Datum"><TextInput type="date" value={costDate} onChange={(e) => setCostDate(e.target.value)} /></Field>
                <label className="flex min-h-11 items-end gap-2 pb-2 text-sm">
                  <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
                  Meteen betaald
                </label>
              </div>
              <Button className="mt-3" disabled={busy === "cost"} onClick={bookCost}>{busy === "cost" ? "Boekt…" : "Kost boeken"}</Button>
              {bills.length === 0 ? <p className="mt-4 text-sm text-mist">Nog geen boeking op deze leverancier.</p> : (
                <ul className="mt-4 divide-y divide-line">
                  {bills.map((journal) => {
                    const amount = journal.lines.filter((line) => line.account.startsWith("6")).reduce((sum, line) => sum + line.debit, 0);
                    return (
                      <li key={journal.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                        <span>{journal.memo}</span>
                        <span className="tabular-nums text-mist">{formatDay(journal.bookedOn)} · {euroLabel(amount)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          )}

          {party && (
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Kicker>Stukken</Kicker>
                <label className="min-h-11 cursor-pointer text-sm text-brass">
                  {busy === "file" ? "Laden…" : "Opladen"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                    className="sr-only"
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }}
                  />
                </label>
              </div>
              {docs.length === 0 ? <p className="mt-3 text-sm text-mist">Nog geen contract of factuur aan dit bestand gehangen.</p> : (
                <ul className="mt-3 divide-y divide-line">
                  {docs.map((doc) => (
                    <li key={doc.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                      <span>{doc.filename}</span>
                      <span className="text-mist">{doc.kind}{doc.amountEur != null ? ` · ${euroLabel(doc.amountEur)}` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Bestand niet leesbaar."));
    reader.readAsDataURL(file);
  });
}
