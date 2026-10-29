import { useEffect, useState } from "react";
import { importSetup, loadJam, saveOutreachSettings, saveTheme } from "@/lib/ops-jam";
import type { Desk } from "@/lib/types";
import { Area, Button, Field, Kicker, Panel, Select, TextInput } from "@/components/ui";

/** Beheer > Instellingen: thema, verzendregels, verboden namen, vrijstellingsdrempel en inrichting importeren. */
export function JamSettings({ desk, refresh, notice, go }: { desk: Desk; refresh: () => Promise<void>; notice: (m: string) => void; go: (id: string) => void }) {
  const [s, setS] = useState({ forbiddenNames: "", maxPerDay: 15, windowFrom: "08:30", windowUntil: "11:00", activityStart: "", exemptionThreshold: 25000 });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    loadJam().then((j) => setS({ ...j.settings, forbiddenNames: j.settings.forbiddenNames.join("\n"), activityStart: j.settings.activityStart ?? "" })).catch(() => {});
  }, []);
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); notice(ok); await refresh(); } catch (e) { notice(e instanceof Error ? e.message : "Mislukt."); } finally { setBusy(false); }
  }
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-3xl">Thema</h2>
        <Panel className="flex max-w-md flex-col gap-3">
          <Field label="Kleuren">
            <Select value={desk.theme} onChange={(e) => run(() => saveTheme({ data: { theme: e.target.value } }), "Thema staat.")}>
              <option value="kade">KADE (messing)</option>
              <option value="justaminute">JustAMinute (navy #104176, coral #E33737)</option>
            </Select>
          </Field>
        </Panel>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-3xl">Prospectie en verzendregels</h2>
        <Panel className="grid max-w-2xl gap-3 md:grid-cols-2">
          <Field label="Max. mails per dag"><TextInput type="number" min={1} max={50} value={s.maxPerDay} onChange={(e) => setS({ ...s, maxPerDay: Number(e.target.value) })} /></Field>
          <Field label="Venster (di-do)">
            <div className="flex gap-2">
              <TextInput type="time" value={s.windowFrom} onChange={(e) => setS({ ...s, windowFrom: e.target.value })} />
              <TextInput type="time" value={s.windowUntil} onChange={(e) => setS({ ...s, windowUntil: e.target.value })} />
            </div>
          </Field>
          <div className="md:col-span-2">
            <Field label="Verboden namen in uitgaande tekst (één per regel; vertrouwelijk, staat alleen in de database)">
              <Area rows={3} value={s.forbiddenNames} onChange={(e) => setS({ ...s, forbiddenNames: e.target.value })} />
            </Field>
          </div>
          <Field label="Startdatum activiteit (pro rata drempel)"><TextInput type="date" value={s.activityStart} onChange={(e) => setS({ ...s, activityStart: e.target.value })} /></Field>
          <Field label="Vrijstellingsdrempel per jaar (EUR)"><TextInput type="number" value={s.exemptionThreshold} onChange={(e) => setS({ ...s, exemptionThreshold: Number(e.target.value) })} /></Field>
          <div className="md:col-span-2"><Button disabled={busy} onClick={() => run(() => saveOutreachSettings({ data: s }), "Regels bewaard.")}>Bewaren</Button></div>
        </Panel>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-3xl">Grok Bots en inrichting</h2>
        <Panel className="flex max-w-2xl flex-col gap-3">
          <p className="text-sm text-mist">De Grok Bot-koppelingen (webhook, sleutel, test, log) staan nu in het hoofdonderdeel GROK BOTS.</p>
          <div><Button variant="ghost" onClick={() => go("grokbots")}>Naar GROK BOTS</Button></div>
          <Field label="Inrichting importeren (JSON met klanten, projecten, taken, bots; bewaar dit bestand buiten git)">
            <input type="file" accept=".json" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(async () => {
              const r = await importSetup({ data: { json: await f.text() } });
              notice(`${r.clients} klanten, ${r.projects} projecten, ${r.tasks} taken, ${r.bots} bots toegevoegd.`);
            }, "Inrichting geladen."); }} />
          </Field>
          <p className="text-xs text-mist">Voorbeeld: docs/handleiding/inrichting-voorbeeld.json</p>
        </Panel>
      </section>
    </>
  );
}
