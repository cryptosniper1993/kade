import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildSnapshot, invoiceTotals } from "@/lib/finance";
import { euroLabel } from "@/lib/money";
import type { Desk } from "@/lib/types";
import { Kicker, Panel } from "@/components/ui";

export function AnalysisView({ desk }: { desk: Desk }) {
  const snap = buildSnapshot(desk.journals, desk.company);
  const exempt = desk.company?.vatRegime === "exempt";
  const byClient = new Map<string, number>();
  for (const invoice of desk.invoices) {
    if (invoice.status === "draft") continue;
    const total = invoiceTotals(invoice.lines, exempt).ex;
    byClient.set(invoice.clientName, (byClient.get(invoice.clientName) ?? 0) + total);
  }
  const clients = [...byClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCost = Math.max(1, ...snap.expensesByAccount.map((r) => r.amount));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Kicker>Analyse</Kicker>
        <h1 className="mt-2 font-display text-5xl">Waar het geld loopt.</h1>
        <p className="mt-2 max-w-xl text-mist">Omzet tegen kosten, per maand van boekjaar {snap.range.label}. Conceptfacturen tellen niet mee.</p>
      </header>
      <Panel>
        <div className="mb-3 flex gap-4 text-sm text-mist">
          <span className="inline-flex items-center gap-2"><span className="inline-block size-2 rounded-sm bg-brass" /> Omzet</span>
          <span className="inline-flex items-center gap-2"><span className="inline-block size-2 rounded-sm bg-mist" /> Kosten</span>
        </div>
        {snap.byMonth.length === 0 ? (
          <p className="text-sm text-mist">Nog geen beweging in dit boekjaar. Boek een factuur of een kost.</p>
        ) : (
          <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={snap.byMonth}>
              <XAxis dataKey="label" stroke="var(--color-mist)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis
                width={44}
                stroke="var(--color-mist)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => {
                  const n = Number(value);
                  if (!Number.isFinite(n)) return "";
                  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)}k`;
                  return String(Math.round(n));
                }}
              />
              <Tooltip
                cursor={{ fill: "var(--color-raised)" }}
                contentStyle={{ background: "var(--color-panel)", border: "1px solid var(--color-line)", color: "var(--color-ivory)" }}
                formatter={(value) => euroLabel(Number(value ?? 0))}
              />
              <Bar dataKey="income" name="Omzet" fill="var(--color-brass)" radius={2} />
              <Bar dataKey="expense" name="Kosten" fill="var(--color-mist)" radius={2} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        )}
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <Kicker>Kosten per rekening</Kicker>
          <ul className="mt-4 flex flex-col gap-3">
            {snap.expensesByAccount.length === 0 && <li className="text-sm text-mist">Nog geen kosten.</li>}
            {snap.expensesByAccount.map((row) => (
              <li key={row.code}>
                <div className="flex justify-between text-sm">
                  <span>{row.name}</span>
                  <span className="tabular-nums">{euroLabel(row.amount)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-sm bg-ink">
                  <div className="h-1.5 rounded-sm bg-brass" style={{ width: `${(row.amount / maxCost) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <Kicker>Klanten, excl. btw</Kicker>
          <ul className="mt-4 flex flex-col gap-3">
            {clients.length === 0 && <li className="text-sm text-mist">Nog geen geboekte facturen.</li>}
            {clients.map(([name, amount]) => (
              <li key={name} className="flex justify-between gap-3 text-sm">
                <span>{name}</span>
                <span className="tabular-nums">{euroLabel(amount)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-mist">
            Netto btw-positie {euroLabel(snap.vatNet)}. Voorafbetaald {euroLabel(snap.prepayments)}.
          </p>
        </Panel>
      </div>
    </div>
  );
}
