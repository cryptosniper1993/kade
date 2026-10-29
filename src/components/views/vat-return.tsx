import { useState } from "react";
import { prepareVatReturn } from "@/lib/ops";
import { euroLabel } from "@/lib/money";
import type { Desk } from "@/lib/types";
import { Button, Field, Kicker, Panel, Select, TextInput } from "@/components/ui";

type Result = Awaited<ReturnType<typeof prepareVatReturn>>;

const LABELS: Record<string, string> = {
  "00": "Omzet 0%", "01": "Omzet 6%", "02": "Omzet 12%", "03": "Omzet 21%", "44": "IC-diensten", "45": "Verlegging (medecontractant)",
  "46": "IC-leveringen", "47": "Andere vrijgestelde", "49": "Uitgereikte creditnota's", "54": "Btw op 01-03", "55": "Btw IC-verwervingen",
  "56": "Btw verlegging aankoop", "59": "Aftrekbare btw", "63": "Btw ontvangen creditnota's", "64": "Btw uitgereikte creditnota's",
  "71": "Te betalen", "72": "Terug te krijgen", "81": "Handelsgoederen", "82": "Diensten en diverse goederen", "83": "Bedrijfsmiddelen", "85": "Ontvangen creditnota's",
};

function download(filename: string, xml: string) {
  const url = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function VatReturnPanel({ desk, notice }: { desk: Desk; notice: (m: string) => void }) {
  const now = new Date();
  const monthly = desk.company?.vatRegime === "monthly";
  const [year, setYear] = useState(String(now.getFullYear()));
  const [period, setPeriod] = useState(String(monthly ? now.getMonth() + 1 : Math.ceil((now.getMonth() + 1) / 3)));
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const p = period === "jaar" ? {} : monthly ? { month: Number(period) } : { quarter: Number(period) };
      setResult(await prepareVatReturn({ data: { year: Number(year), ...p } }));
    } catch (error) {
      notice(error instanceof Error ? error.message : "Voorbereiden mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="flex flex-col gap-3">
      <Kicker>Btw-aangifte voorbereiden</Kicker>
      <p className="text-sm text-mist">Uit uitgereikte facturen, creditnota's en geboekte inkomende facturen. Controleer altijd vóór je in Intervat indient: aankopen met verlegging of intracommunautaire verwervingen (55, 56, 86-88) vul je zelf aan, en aankopen staan allemaal in 82.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Jaar"><TextInput inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} /></Field>
        <Field label={monthly ? "Maand" : "Kwartaal"}>
          <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {(monthly ? Array.from({ length: 12 }, (_, i) => i + 1) : [1, 2, 3, 4]).map((n) => (
              <option key={n} value={String(n)}>{monthly ? n : `Q${n}`}</option>
            ))}
            <option value="jaar">Heel jaar (listings)</option>
          </Select>
        </Field>
        <div className="flex items-end"><Button disabled={busy} onClick={run}>Bereken</Button></div>
      </div>
      {result && (
        <div className="flex flex-col gap-3 text-sm">
          {!result.exempt && (
            <table className="w-full">
              <tbody>
                {Object.entries(result.grids).filter(([, v]) => v).map(([k, v]) => (
                  <tr key={k} className="border-b border-line">
                    <td className="py-1 tabular-nums">{k}</td>
                    <td className="py-1 text-mist">{LABELS[k]}</td>
                    <td className="py-1 text-right tabular-nums">{euroLabel(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {result.exempt && (
            <p>Omzetopgave vrijstellingsregeling {year}: <span className="tabular-nums">{euroLabel(result.turnover)}</span> (drempel {euroLabel(result.threshold)}, +10% tolerantie). Indienen vóór 31 maart via Intervat › Btw-klantenlisting.</p>
          )}
          <p>Klantenlisting {year}: {result.listing.length} klant(en) vanaf 250 euro. IC-opgave: {result.ic.length} lijn(en).</p>
          <div className="flex flex-wrap gap-2">
            {result.files.map((f) => (
              <Button key={f.filename} variant="ghost" onClick={() => download(f.filename, f.xml)}>{f.filename}</Button>
            ))}
          </div>
          <p className="text-xs text-mist">De XML volgt de Intervat-structuur (VATConsignment, ClientListingConsignment, IntraConsignment) maar is niet tegen de officiële XSD gevalideerd.</p>
        </div>
      )}
    </Panel>
  );
}
