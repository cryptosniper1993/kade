import { useState } from "react";
import { saveCompany, seedDemo, clearDemo } from "@/lib/ops";
import type { Company, Desk } from "@/lib/types";
import { Button, Field, Kicker, Panel, Select, TextInput } from "@/components/ui";

const empty: Company = {
  name: "",
  legalForm: "bv",
  vatNumber: "",
  enterpriseNumber: "",
  address: "",
  city: "",
  email: "",
  iban: "",
  vatRegime: "quarterly",
  yearEndMonth: 12,
};

export function CompanyView({ desk, refresh, notice }: { desk: Desk; refresh: () => Promise<void>; notice: (m: string) => void }) {
  const [form, setForm] = useState<Company>(desk.company ?? empty);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof Company>(key: K, value: Company[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setBusy(true);
    try {
      await saveCompany({ data: form });
      await refresh();
      notice("Zaakfiche bewaard.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Bewaren mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function demo(which: "seed" | "clear") {
    setBusy(true);
    try {
      if (which === "seed") await seedDemo();
      else await clearDemo();
      await refresh();
      notice(which === "seed" ? "Demoboekjaar staat klaar. Wis het wanneer de echte cijfers beginnen." : "Demogegevens weg.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Kicker>Zaak</Kicker>
        <h1 className="mt-2 font-display text-5xl">De fiche</h1>
        <p className="mt-2 max-w-xl text-mist text-pretty">Dit staat op je facturen en stuurt de fiscale kalender. Een BV krijgt andere plichten dan een eenmanszaak.</p>
      </header>
      <Panel className="grid gap-4 md:grid-cols-2">
        <Field label="Naam">
          <TextInput value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Rechtsvorm">
          <Select value={form.legalForm} onChange={(e) => set("legalForm", e.target.value as Company["legalForm"])}>
            <option value="bv">BV</option>
            <option value="eenmanszaak">Eenmanszaak</option>
            <option value="vof">VOF</option>
            <option value="commv">CommV</option>
          </Select>
        </Field>
        <Field label="Btw-nummer">
          <TextInput value={form.vatNumber} onChange={(e) => set("vatNumber", e.target.value)} placeholder="BE0123.456.789" />
        </Field>
        <Field label="Ondernemingsnummer">
          <TextInput value={form.enterpriseNumber} onChange={(e) => set("enterpriseNumber", e.target.value)} />
        </Field>
        <Field label="Adres">
          <TextInput value={form.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field label="Gemeente">
          <TextInput value={form.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <Field label="E-mail">
          <TextInput value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="IBAN">
          <TextInput value={form.iban} onChange={(e) => set("iban", e.target.value)} />
        </Field>
        <Field label="Btw-regime">
          <Select value={form.vatRegime} onChange={(e) => set("vatRegime", e.target.value as Company["vatRegime"])}>
            <option value="quarterly">Kwartaal</option>
            <option value="monthly">Maand</option>
            <option value="exempt">Vrijstelling onder 25.000</option>
          </Select>
        </Field>
        <Field label="Afsluitmaand">
          <Select value={String(form.yearEndMonth)} onChange={(e) => set("yearEndMonth", Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </Select>
        </Field>
        <div className="md:col-span-2">
          <Button onClick={save} disabled={busy}>Fiche bewaren</Button>
        </div>
      </Panel>
      <Panel>
        <Kicker>Demokade</Kicker>
        <p className="mt-3 max-w-2xl text-sm text-mist text-pretty">
          Een fictieve BV, Noorderlicht IT, met omzet, een openstaande factuur, kosten en een voorafbetaling. Handig om de terminal te zien ademen. Het is geen echte klant en geen echte bon.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => demo("seed")}>Demoboekjaar laden</Button>
          <Button variant="ghost" disabled={busy} onClick={() => demo("clear")}>Demo wissen</Button>
        </div>
      </Panel>
    </div>
  );
}
