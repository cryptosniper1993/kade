import { buildSnapshot } from "@/lib/finance";
import { euroLabel } from "@/lib/money";
import type { Desk } from "@/lib/types";
import type { SideRow } from "@/lib/finance";
import { Kicker, Panel } from "@/components/ui";

export function BalanceView({ desk }: { desk: Desk }) {
  const snap = buildSnapshot(desk.journals, desk.company);
  const balanced = Math.abs(snap.gap) < 0.05;
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Kicker>Balans</Kicker>
        <h1 className="mt-2 font-display text-5xl">Sluit de zaak.</h1>
        <p className="mt-2 max-w-2xl text-mist text-pretty">
          Activa links, schulden en eigen vermogen rechts, plus het resultaat van boekjaar {snap.range.label}. {snap.taxNote}
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <Big label="Activa" value={euroLabel(snap.assetTotal)} />
        <Big label="Passiva + resultaat" value={euroLabel(snap.liabilityTotal + snap.equityTotal + snap.result)} />
        <Big label={balanced ? "Verschil" : "Verschil, nakijken"} value={euroLabel(snap.gap)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Column title="Activa" rows={snap.assets} total={snap.assetTotal} />
        <div className="flex flex-col gap-4">
          <Column title="Schulden" rows={snap.liabilities} total={snap.liabilityTotal} />
          <Column title="Eigen vermogen" rows={[...snap.equity, { code: "res", name: "Resultaat boekjaar", amount: snap.result }]} total={snap.equityTotal + snap.result} />
        </div>
      </div>
      <Panel>
        <Kicker>Vereenvoudigde belasting</Kicker>
        <p className="mt-3 font-display text-4xl tabular-nums">{euroLabel(snap.estimatedTax)}</p>
        <p className="mt-2 max-w-2xl text-sm text-mist text-pretty">{snap.taxNote} Dit is geen aangifte.</p>
      </Panel>
    </div>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-raised px-4 py-4">
      <p className="text-xs tracking-widest text-mist uppercase">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums">{value}</p>
    </div>
  );
}

function Column({ title, rows, total }: { title: string; rows: SideRow[]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.amount)));
  return (
    <Panel>
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-3xl">{title}</h2>
        <span className="tabular-nums text-mist">{euroLabel(total)}</span>
      </div>
      <ul className="mt-4 flex flex-col gap-3">
        {rows.length === 0 && <li className="text-sm text-mist">Nog niets op deze kant.</li>}
        {rows.map((row) => (
          <li key={row.code + row.name}>
            <div className="flex justify-between gap-3 text-sm">
              <span><span className="text-mist">{row.code}</span> {row.name}</span>
              <span className="tabular-nums">{euroLabel(row.amount)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-sm bg-ink">
              <div className="h-1.5 rounded-sm bg-brass" style={{ width: `${Math.min(100, (Math.abs(row.amount) / max) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
