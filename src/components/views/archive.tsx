import { useState } from "react";
import { deleteDocument, getDocument, postEntry, saveDocument } from "@/lib/ops";
import { EXPENSE_ACCOUNTS } from "@/lib/accounts";
import { euroLabel } from "@/lib/money";
import type { Desk } from "@/lib/types";
import { Button, Field, Kicker, Panel, Select, TextInput } from "@/components/ui";

export function ArchiveView({ desk, refresh, notice }: { desk: Desk; refresh: () => Promise<void>; notice: (m: string) => void }) {
  const [vendor, setVendor] = useState("");
  const [kind, setKind] = useState("bon");
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ title: string; src: string; mime: string } | null>(null);
  const [bookId, setBookId] = useState<string | null>(null);
  const [account, setAccount] = useState("6110");
  const [busy, setBusy] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [clientId, setClientId] = useState("");

  async function upload() {
    if (!file) return notice("Kies eerst een bestand.");
    if (file.size > 700_000) return notice("Houd het bestand onder 700 KB.");
    setBusy(true);
    try {
      const dataUrl = await readFile(file);
      await saveDocument({
        data: {
          filename: file.name,
          mime: file.type,
          dataUrl,
          kind,
          vendor,
          docDate,
          amountEur: amount ? Number(amount.replace(",", ".")) : null,
          note,
          clientId,
          supplierId,
        },
      });
      setFile(null);
      setVendor("");
      setNote("");
      setAmount("");
      setClientId("");
      setSupplierId("");
      await refresh();
      notice("Document in het archief.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Opladen mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string, title: string) {
    try {
      const doc = await getDocument({ data: id });
      setPreview({ title, src: doc.data_url, mime: doc.mime });
    } catch (error) {
      notice(error instanceof Error ? error.message : "Openen mislukt.");
    }
  }

  async function book(amountEur: number | null) {
    if (!bookId || !amountEur) return;
    try {
      await postEntry({
        data: {
          kind: "expense",
          date: docDate,
          memo: vendor || "Bon",
          account,
          amountEx: amountEur,
          vatRate: desk.company?.vatRegime === "exempt" ? 0 : 21,
          paid: true,
          supplierId: desk.documents.find((doc) => doc.id === bookId)?.supplierId ?? "",
        },
      });
      setBookId(null);
      await refresh();
      notice("Bon geboekt als kost. De btw is 21% tenzij je vrijgesteld bent. Pas het aan in het journaal als dat niet klopt.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Boeken mislukt.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Kicker>Archief</Kicker>
        <h1 className="mt-2 font-display text-5xl">Bonnen en facturen.</h1>
        <p className="mt-2 max-w-xl text-mist text-pretty">Bewaar het bewijs bij de boeking. De fiscus wil tien jaar kunnen terugkijken. Houd bestanden klein, dit archief zit in je eigen kluis.</p>
      </header>
      <Panel className="grid gap-3 md:grid-cols-2">
        <Field label="Leverancier"><TextInput value={vendor} onChange={(e) => setVendor(e.target.value)} /></Field>
        <Field label="Soort">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="bon">Bon</option>
            <option value="aankoopfactuur">Aankoopfactuur</option>
            <option value="contract">Contract</option>
            <option value="ander">Ander</option>
          </Select>
        </Field>
        <Field label="Datum"><TextInput type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} /></Field>
        <Field label="Bedrag excl. btw"><TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></Field>
        <Field label="Klant in het bestand">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Geen</option>
            {desk.clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Leverancier in het bestand">
          <Select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); const found = desk.suppliers.find((item) => item.id === e.target.value); if (found && !vendor) setVendor(found.name); }}>
            <option value="">Geen</option>
            {desk.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Nota"><TextInput value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Field label="Bestand">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            className="min-h-11 w-full text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        <div className="md:col-span-2">
          <Button disabled={busy} onClick={upload}>Opladen</Button>
        </div>
      </Panel>
      <ul className="grid gap-3 sm:grid-cols-2">
        {desk.documents.length === 0 && <li className="text-sm text-mist">Nog niets opgeladen.</li>}
        {desk.documents.map((doc) => (
          <li key={doc.id} className="rounded-md border border-line bg-panel p-4">
            <p className="text-xs tracking-widest text-brass uppercase">{doc.kind}</p>
            <p className="mt-2 font-medium">{doc.vendor || doc.filename}</p>
            <p className="text-sm text-mist">{doc.docDate?.split("-").reverse().join("/") ?? "zonder datum"} {doc.amountEur != null ? `· ${euroLabel(doc.amountEur)}` : ""}</p>
            <p className="mt-1 text-sm text-mist">{doc.note}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => open(doc.id, doc.filename)}>Open</Button>
              <Button variant="ghost" onClick={() => setBookId(doc.id)}>Boek als kost</Button>
              <Button variant="ghost" onClick={async () => { await deleteDocument({ data: doc.id }); await refresh(); }}>Wis</Button>
            </div>
            {bookId === doc.id && (
              <div className="mt-3 flex flex-col gap-2">
                <Select value={account} onChange={(e) => setAccount(e.target.value)}>
                  {EXPENSE_ACCOUNTS.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                </Select>
                <Button onClick={() => book(doc.amountEur)}>Bevestig boeking</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {preview && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-ink/80 p-4" onClick={() => setPreview(null)}>
          <div className="max-h-full w-full max-w-3xl overflow-auto rounded-md bg-panel p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-medium">{preview.title}</p>
              <Button variant="ghost" onClick={() => setPreview(null)}>Sluit</Button>
            </div>
            {preview.mime.startsWith("image/") ? (
              <img src={preview.src} alt="" className="max-h-[70vh] w-full object-contain" />
            ) : (
              <a className="text-brass underline" href={preview.src} download={preview.title}>Download pdf</a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Lezen mislukt."));
    reader.readAsDataURL(file);
  });
}
