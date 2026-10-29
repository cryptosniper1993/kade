import { useState } from "react";
import { EXPENSE_ACCOUNTS } from "@/lib/accounts";
import { deleteJournal, postEntry } from "@/lib/ops";
import { euroLabel } from "@/lib/money";
import { TAX_GUIDE } from "@/lib/tax";
import { VatReturnPanel } from "@/components/views/vat-return";
import type { Desk } from "@/lib/types";
import { Button, Field, Kicker, Panel, Select, TextInput } from "@/components/ui";

export function BooksView({ desk, refresh, notice }: { desk: Desk; refresh: () => Promise<void>; notice: (m: string) => void }) {
  const [kind, setKind] = useState("expense");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [account, setAccount] = useState("6110");
  const [amount, setAmount] = useState("");
  const [vatRate, setVatRate] = useState("21");
  const [paid, setPaid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openGuide, setOpenGuide] = useState<string | null>(TAX_GUIDE[0]?.title ?? null);

  async function book() {
    setBusy(true);
    try {
      const value = Number(amount.replace(",", "."));
      if (kind === "expense") {
        await postEntry({ data: { kind: "expense", date, memo, account, amountEx: value, vatRate: Number(vatRate), paid, supplierId: "" } });
      } else if (kind === "asset") {
        await postEntry({ data: { kind: "asset", date, memo, amountEx: value, vatRate: Number(vatRate) } });
      } else if (kind === "salary") {
        await postEntry({ data: { kind: "salary", date, memo, amount: value } });
      } else if (kind === "prepay") {
        await postEntry({ data: { kind: "prepay", date, amount: value } });
      } else {
        await postEntry({ data: { kind: "capital", date, amount: value } });
      }
      setMemo("");
      setAmount("");
      await refresh();
      notice("Geboekt.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Boeken mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const result = await deleteJournal({ data: id });
    if (!result.ok) notice(result.error);
    else {
      await refresh();
      notice("Boeking weg.");
    }
  }

  const rows = [...desk.journals].reverse();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Kicker>Boeken</Kicker>
        <h1 className="mt-2 font-display text-5xl">Dubbel, of niet.</h1>
        <p className="mt-2 max-w-2xl text-mist text-pretty">Elke boeking sluit: debet gelijk aan credit. Facturen maken hun eigen lijnen. Hier boek je kosten, bezoldiging, voorafbetalingen en inbreng.</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className="flex flex-col gap-3 lg:col-span-2">
          <Field label="Soort">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="expense">Kost</option>
              <option value="asset">Informaticamateriaal</option>
              <option value="salary">Bezoldiging</option>
              <option value="prepay">Voorafbetaling VenB</option>
              <option value="capital">Inbreng op de bank</option>
            </Select>
          </Field>
          <Field label="Datum">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {(kind === "expense" || kind === "asset" || kind === "salary") && (
            <Field label="Omschrijving">
              <TextInput value={memo} onChange={(e) => setMemo(e.target.value)} />
            </Field>
          )}
          {kind === "expense" && (
            <Field label="Rekening">
              <Select value={account} onChange={(e) => setAccount(e.target.value)}>
                {EXPENSE_ACCOUNTS.map((item) => (
                  <option key={item.code} value={item.code}>{item.code} {item.name}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={kind === "expense" || kind === "asset" ? "Bedrag excl. btw" : "Bedrag"}>
            <TextInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
          </Field>
          {(kind === "expense" || kind === "asset") && desk.company?.vatRegime !== "exempt" && (
            <Field label="Btw">
              <Select value={vatRate} onChange={(e) => setVatRate(e.target.value)}>
                <option value="21">21%</option>
                <option value="12">12%</option>
                <option value="6">6%</option>
                <option value="0">0%</option>
              </Select>
            </Field>
          )}
          {kind === "expense" && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
              Meteen betaald via de bank
            </label>
          )}
          <Button onClick={book} disabled={busy}>Boeken</Button>
        </Panel>
        <Panel className="lg:col-span-3">
          <Kicker>Journaal</Kicker>
          <ul className="mt-3 divide-y divide-line">
            {rows.length === 0 && <li className="py-4 text-sm text-mist">Het journaal is leeg. Dat is eerlijk, niet gezellig.</li>}
            {rows.slice(0, 40).map((journal) => (
              <li key={journal.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm"><span className="text-mist">{journal.bookedOn.split("-").reverse().join("/")}</span> {journal.memo}</span>
                  {journal.source !== "invoice" && (
                    <button type="button" className="text-sm text-mist hover:text-ivory" onClick={() => remove(journal.id)}>Wis</button>
                  )}
                </div>
                <ul className="mt-1">
                  {journal.lines.map((line) => (
                    <li key={line.id} className="flex justify-between text-xs text-mist tabular-nums">
                      <span>{line.account} {line.label}</span>
                      <span>{line.debit ? euroLabel(line.debit) : ""} {line.credit ? `− ${euroLabel(line.credit)}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <VatReturnPanel desk={desk} notice={notice} />
      <Panel>
        <Kicker>Belgische plichten, 2026</Kicker>
        <p className="mt-2 text-sm text-mist">Samengevat uit de regels voor een kleine zaak. Geen advies op maat. De aangifte blijft van jou en je boekhouder.</p>
        <div className="mt-4 flex flex-col">
          {TAX_GUIDE.map((section) => {
            const open = openGuide === section.title;
            return (
              <div key={section.title} className="border-t border-line">
                <button type="button" className="flex min-h-11 w-full items-center justify-between text-left" onClick={() => setOpenGuide(open ? null : section.title)}>
                  <span className="font-medium">{section.title}</span>
                  <span className="text-brass">{open ? "–" : "+"}</span>
                </button>
                {open && <p className="pb-4 text-sm text-mist text-pretty">{section.body}</p>}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
