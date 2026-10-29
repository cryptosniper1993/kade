import { useState } from "react";
import { daysUntil, fleetSnapshot } from "@/lib/assets";
import { buildSnapshot } from "@/lib/finance";
import { euroLabel } from "@/lib/money";
import { dailyTips, duties } from "@/lib/tax";
import { brusselsToday, formatDay } from "@/lib/day";
import { isLate, personName, priorityQueue, projectName, projectProgress } from "@/lib/briefing";
import { writeMorningBrief } from "@/lib/work";
import type { Desk } from "@/lib/types";
import { Button, Kicker, Panel } from "@/components/ui";

export function Bridge({
  desk,
  go,
  refresh,
  notice,
}: {
  desk: Desk;
  go: (id: string) => void;
  refresh: () => Promise<void>;
  notice: (m: string) => void;
}) {
  const today = new Date();
  const day = brusselsToday(today);
  const snapshot = buildSnapshot(desk.journals, desk.company, today);
  const tips = dailyTips(snapshot, desk.company, desk.invoices, today);
  const list = duties(desk.company, today);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "numeric", hourCycle: "h23" }).format(today),
  );
  const hello = hour < 12 ? "Goedemorgen" : hour < 18 ? "Goedemiddag" : "Goedenavond";
  const openInvoices = desk.invoices.filter((i) => i.status === "sent");
  const queue = priorityQueue(desk.tasks, day);
  const late = queue.filter((task) => isLate(task, day));
  const high = queue.filter((task) => task.priority === "hoog");
  const cip = queue.filter((task) => task.kind === "cip");
  const active = desk.projects.filter((project) => project.status === "actief");
  const fleet = fleetSnapshot(desk.assets, day);
  const fails = desk.incidents.filter((item) => item.status !== "gesloten");
  const [writing, setWriting] = useState(false);

  async function write(force: boolean) {
    setWriting(true);
    try {
      const result = await writeMorningBrief({ data: { force } });
      if (!result.ok) {
        notice(result.error);
        return;
      }
      await refresh();
      notice(result.cached ? "De briefing van vandaag stond er al." : "Briefing geschreven.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "De briefing lukte niet.");
    } finally {
      setWriting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Kicker>Brug</Kicker>
          <h1 className="mt-2 font-display text-5xl text-ivory">{hello}.</h1>
          <p className="mt-2 max-w-xl text-mist text-pretty">
            {desk.company ? desk.company.name : "De zaakfiche is nog leeg."} Boekjaar {snapshot.range.label}. Eerst het open werk, daarna de cijfers.
          </p>
        </div>
        {!desk.company && (
          <button type="button" onClick={() => go("zaak")} className="min-h-11 rounded-sm bg-brass px-4 text-sm font-medium text-brass-ink">
            Zaakfiche invullen
          </button>
        )}
      </header>

      <Panel>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <Kicker>Ochtendbriefing · {formatDay(day)}</Kicker>
          <button type="button" onClick={() => go("taken")} className="text-sm text-mist hover:text-ivory">Naar taken</button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Mini label="Open" value={String(queue.length)} />
          <Mini label="Te laat" value={String(late.length)} />
          <Mini label="Prio" value={String(high.length)} />
        </div>
        {queue.length === 0 ? (
          <p className="mt-4 text-sm text-mist">Geen open taken. Geen CIP. Geen prio. Een stille kade is ook een briefing.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {queue.slice(0, 6).map((task) => (
              <li key={task.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <span>
                  <span className={task.priority === "hoog" ? "text-brass" : "text-mist"}>{task.priority}</span>
                  {task.kind === "cip" && <span className="ml-2 text-xs tracking-widest text-brass uppercase">CIP</span>}
                  <span className="ml-2 font-medium">{task.title}</span>
                </span>
                <span className="text-sm text-mist">
                  {personName(desk.people, task.assigneeId)}
                  <span className="mx-1.5">·</span>
                  {projectName(desk.projects, task.projectId)}
                  {task.dueOn && (
                    <>
                      <span className="mx-1.5">·</span>
                      {isLate(task, day) ? "te laat " : ""}
                      {formatDay(task.dueOn)}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {queue.length > 6 && <p className="mt-2 text-sm text-mist">En nog {queue.length - 6} open. Die staan op Taken.</p>}
        {cip.length > 0 && (
          <p className="mt-3 text-sm text-mist">{cip.length} open CIP-punt{cip.length === 1 ? "" : "en"}. Verbeteren is geen los briefje.</p>
        )}
        {active.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {active.slice(0, 4).map((project) => {
              const progress = projectProgress(desk.tasks, project.id);
              return (
                <li key={project.id}>
                  <button type="button" onClick={() => go("projecten")} className="flex w-full items-center justify-between gap-3 text-left text-sm">
                    <span>{project.name}</span>
                    <span className="tabular-nums text-mist">{progress.done}/{progress.total} · {progress.pct}%</span>
                  </button>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-ink">
                    <div className="h-full bg-brass" style={{ width: `${progress.pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {desk.briefing && desk.briefing.day === day && (
          <p className="mt-4 whitespace-pre-wrap border-t border-line pt-4 text-sm text-pretty">{desk.briefing.body}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={writing} onClick={() => write(Boolean(desk.briefing))}>
            {writing ? "Loots schrijft…" : desk.briefing ? "Briefing herschrijven" : "Laat Loots de briefing schrijven"}
          </Button>
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <Kicker>Inventaris</Kicker>
          <button type="button" onClick={() => go("inventaris")} className="text-sm text-mist hover:text-ivory">Naar inventaris</button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Mini label="Boekwaarde" value={euroLabel(fleet.book)} compact />
          <Mini label="Lease" value={euroLabel(fleet.monthlyLease)} compact />
          <Mini label="Storingen" value={String(fails.length)} />
        </div>
        {fails.length === 0 && fleet.ending.length === 0 && fleet.broken.length === 0 ? (
          <p className="mt-4 text-sm text-mist">Geen open storing, geen contract dat afloopt, geen defect stuk.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {fails.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <span>
                  <span className="text-xs tracking-widest text-brass uppercase">Storing</span>
                  <span className="ml-2 font-medium">{item.title}</span>
                </span>
                <span className="text-sm text-mist">{item.status === "opvolging" ? "in opvolging" : "open"} · {projectName(desk.projects, item.projectId)}</span>
              </li>
            ))}
            {fleet.broken.filter((asset) => !fails.some((item) => item.assetId === asset.id)).map((asset) => (
              <li key={asset.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <span>
                  <span className="text-xs tracking-widest text-brass uppercase">Defect</span>
                  <span className="ml-2 font-medium">{asset.name}</span>
                </span>
                <span className="text-sm text-mist">{personName(desk.people, asset.holderId)}</span>
              </li>
            ))}
            {fleet.ending.map((asset) => (
              <li key={`end-${asset.id}`} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <span>
                  <span className="text-mist">Lease</span>
                  <span className="ml-2 font-medium">{asset.name}</span>
                </span>
                <span className="text-sm text-mist">
                  {asset.endsOn && daysUntil(day, asset.endsOn) < 0 ? "voorbij" : `einde ${asset.endsOn ? formatDay(asset.endsOn) : ""}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Omzet" value={euroLabel(snapshot.income)} hint="Geboekt in dit boekjaar" />
        <Stat label="Kosten" value={euroLabel(snapshot.expense)} hint="Zonder btw" />
        <Stat label="Resultaat" value={euroLabel(snapshot.profit)} hint={snapshot.profit >= 0 ? "Winst vóór fiscale correcties" : "Verlies in de boeken"} />
        <Stat label="Bank" value={euroLabel(snapshot.cash)} hint="Rekening 5500" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <Kicker>Loots, vandaag</Kicker>
          <ul className="mt-4 flex flex-col gap-4">
            {tips.map((tip) => (
              <li key={tip.id} className="border-l-2 border-brass pl-4">
                <p className="font-display text-2xl">{tip.title}</p>
                <p className="mt-1 text-sm text-mist text-pretty">{tip.body}</p>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => go("loots")} className="mt-5 text-sm text-brass underline-offset-4 hover:underline">
            Laat Loots dit uitwerken
          </button>
        </Panel>
        <Panel className="lg:col-span-2">
          <Kicker>Kalender</Kicker>
          <ul className="mt-4 flex flex-col gap-3">
            {list.map((duty) => (
              <li key={duty.id} className="flex gap-3">
                <span className="w-14 shrink-0 font-display text-xl tabular-nums text-brass">
                  {duty.days < 0 ? "laat" : duty.days === 0 ? "nu" : `${duty.days}d`}
                </span>
                <span>
                  <span className="block text-sm font-medium">{duty.title}</span>
                  <span className="block text-sm text-mist">{duty.date.split("-").reverse().join("/")}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel>
        <div className="flex items-baseline justify-between gap-3">
          <Kicker>Open posten</Kicker>
          <button type="button" onClick={() => go("facturen")} className="text-sm text-mist hover:text-ivory">Naar facturen</button>
        </div>
        {openInvoices.length === 0 ? (
          <p className="mt-4 text-sm text-mist">Geen verstuurde facturen die nog openstaan. Ofwel is de kade leeg, ofwel is iedereen betaald.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {openInvoices.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <span>
                  <span className="font-medium">{invoice.number}</span>
                  <span className="ml-2 text-mist">{invoice.clientName}</span>
                </span>
                <span className="text-sm tabular-nums text-mist">vervalt {invoice.dueDate.split("-").reverse().join("/")}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Mini({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs tracking-widest text-mist uppercase">{label}</p>
      <p className={compact ? "mt-1 font-display text-2xl tabular-nums" : "mt-1 font-display text-4xl tabular-nums"}>{value}</p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border border-line bg-raised px-4 py-4">
      <p className="text-xs tracking-widest text-mist uppercase">{label}</p>
      <p className="mt-2 font-display text-4xl tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-mist">{hint}</p>
    </div>
  );
}
