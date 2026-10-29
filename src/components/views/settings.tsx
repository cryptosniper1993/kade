import { useState } from "react";
import { saveBrand } from "@/lib/ops";
import type { Desk } from "@/lib/types";
import { VoiceForm } from "@/components/voice-form";
import { PeppolSettings } from "@/components/views/peppol-settings";
import { GrokBotSettings } from "@/components/grokbot/settings";
import { MembersSettings } from "@/components/views/members";
import { Button, Field, Kicker, Panel, TextInput } from "@/components/ui";

export function SettingsView({ desk, refresh, notice }: { desk: Desk; refresh: () => Promise<void>; notice: (m: string) => void }) {
  const [brand, setBrand] = useState(desk.brand);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await saveBrand({ data: { brand } });
      await refresh();
      notice("Naam staat.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "De naam bleef liggen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <Kicker>Instellingen</Kicker>
        <h1 className="mt-2 font-display text-5xl">Deur en stem.</h1>
        <p className="mt-2 max-w-xl text-mist text-pretty">
          De terminal heet nu {desk.brand}. De hoofdstem heet {desk.voice.agentName}. Geen van beide verandert de zaakfiche.
        </p>
      </header>
      <Panel className="flex max-w-md flex-col gap-3">
        <Field label="Naam van de interface">
          <TextInput value={brand} maxLength={24} onChange={(e) => setBrand(e.target.value)} placeholder="KADE" />
        </Field>
        <Button disabled={busy} onClick={save}>{busy ? "Bewaren…" : "Naam bewaren"}</Button>
      </Panel>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-3xl">Hoofdstem</h2>
        <p className="max-w-xl text-sm text-mist text-pretty">
          Snelheid, toon en volume gelden voor het voorlezen in deze browser. Op een Mac staan de Nederlandse stemmen bij Ellen of Xander, als het systeem ze heeft. Bewaren geldt voor dit account, op elk toestel. Welke stem er klinkt, hangt van die computer af.
        </p>
        <VoiceForm desk={desk} refresh={refresh} notice={notice} />
      </section>
      <MembersSettings notice={notice} />
      <PeppolSettings desk={desk} notice={notice} />
      <GrokBotSettings notice={notice} />
    </div>
  );
}
