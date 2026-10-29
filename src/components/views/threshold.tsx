import { useEffect, useState } from "react";
import { loadJam } from "@/lib/ops-jam";
import { invoiceTotals } from "@/lib/finance";
import { proRataThreshold, thresholdState } from "@/lib/outreach";
import type { Desk } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Kicker, Panel } from "@/components/ui";

const eur = (n: number) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/** Omzet tegenover de vrijstellingsdrempel (art. 56bis), pro rata in het startjaar (dossier §9). */
export function ThresholdMeter({ desk, year }: { desk: Desk; year: number }) {
  const [cfg, setCfg] = useState<{ threshold: number; start: string | null } | null>(null);
  useEffect(() => { loadJam().then((j) => setCfg({ threshold: j.settings.exemptionThreshold, start: j.settings.activityStart })).catch(() => setCfg({ threshold: 25000, start: null })); }, []);
  if (desk.company?.vatRegime !== "exempt" || !cfg) return null;
  const revenue = desk.invoices
    .filter((i) => i.status !== "draft" && i.issueDate.startsWith(String(year)))
    .reduce((sum, i) => sum + invoiceTotals(i.lines, true).ex, 0);
  const limit = proRataThreshold(cfg.threshold, cfg.start, year);
  const st = thresholdState(revenue, limit);
  return (
    <Panel className="flex flex-col gap-2">
      <Kicker>Vrijstellingsdrempel {year}</Kicker>
      <p className="font-display text-3xl tabular-nums">{eur(revenue)} <span className="text-base text-mist">van {eur(limit)}{limit !== cfg.threshold ? ` (pro rata van ${eur(cfg.threshold)})` : ""}</span></p>
      <div className="h-2 overflow-hidden rounded-sm bg-ink"><div className={cn("h-full", st.level === "ok" ? "bg-ivory" : "bg-brass")} style={{ width: `${Math.min(100, st.pct)}%` }} /></div>
      <p className={cn("text-sm", st.level === "ok" ? "text-mist" : "text-brass")}>
        {st.level === "over" ? "Drempel overschreden: normaal btw-regime nodig. Contacteer je boekhouder." : st.level === "zicht" ? `De vrijstellingsdrempel komt in zicht: nog ${eur(st.left)}.` : `Nog ${eur(st.left)} tot de drempel.`}
      </p>
    </Panel>
  );
}
