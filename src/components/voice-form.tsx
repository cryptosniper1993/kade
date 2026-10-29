import { useEffect, useState } from "react";
import { saveVoice } from "@/lib/ops";
import { canSpeak, loadVoices, silence, speak } from "@/lib/speech";
import type { Desk, VoiceSettings } from "@/lib/types";
import { Button, Field, Panel, Select, TextInput } from "@/components/ui";

const LANGS = [
  ["nl-BE", "Nederlands (België)"],
  ["nl-NL", "Nederlands (Nederland)"],
  ["fr-BE", "Frans (België)"],
  ["en-GB", "Engels (VK)"],
  ["en-US", "Engels (VS)"],
  ["de-DE", "Duits"],
];

export function VoiceForm({ desk, refresh, notice }: { desk: Desk; refresh: () => Promise<void>; notice: (m: string) => void }) {
  const [form, setForm] = useState<VoiceSettings>(desk.voice);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    loadVoices().then((list) => { if (live) setVoices(list); });
    return () => { live = false; };
  }, []);

  const ordered = [...voices].sort((a, b) => {
    const rank = (voice: SpeechSynthesisVoice) => (voice.lang.toLowerCase().startsWith("nl") ? 0 : 1);
    return rank(a) - rank(b) || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name, "nl");
  });

  function set<K extends keyof VoiceSettings>(key: K, value: VoiceSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setBusy(true);
    try {
      await saveVoice({ data: form });
      await refresh();
      notice("Stem staat.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "De stem bleef liggen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="flex max-w-xl flex-col gap-4">
      <Field label="Naam van de hoofdstem">
        <TextInput value={form.agentName} maxLength={24} onChange={(e) => set("agentName", e.target.value)} />
      </Field>
      <Field label="Stem van deze computer">
        <Select value={form.voiceUri} onChange={(e) => set("voiceUri", e.target.value)} disabled={!canSpeak() || ordered.length === 0}>
          <option value="">Automatisch, bij voorkeur Nederlands</option>
          {ordered.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>
          ))}
        </Select>
      </Field>
      {!canSpeak() && <p className="text-sm text-mist">Deze browser leest niet voor. Het gesprek blijft tekst.</p>}
      {canSpeak() && ordered.length === 0 && <p className="text-sm text-mist">Nog geen stemmen geladen. Even wachten, of de pagina herladen.</p>}
      <Field label="Taal waarin je inspreekt">
        <Select value={form.lang} onChange={(e) => set("lang", e.target.value)}>
          {LANGS.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </Select>
      </Field>
      <Slider label="Snelheid" min={0.7} max={1.5} step={0.05} value={form.rate} onChange={(value) => set("rate", value)} />
      <Slider label="Toonhoogte" min={0.7} max={1.4} step={0.05} value={form.pitch} onChange={(value) => set("pitch", value)} />
      <Slider label="Volume" min={0.2} max={1} step={0.05} value={form.volume} onChange={(value) => set("volume", value)} />
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={form.autoSpeak} onChange={(e) => set("autoSpeak", e.target.checked)} />
        Antwoorden hardop
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={form.sendOnListen} onChange={(e) => set("sendOnListen", e.target.checked)} />
        Na het inspreken meteen sturen
      </label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={save}>{busy ? "Bewaren…" : "Stem bewaren"}</Button>
        <Button
          variant="ghost"
          disabled={!canSpeak()}
          onClick={() => speak(`Dit is ${form.agentName || "de hoofdstem"}. De kade is open.`, form)}
        >
          Test
        </Button>
        <Button variant="ghost" onClick={silence}>Stop</Button>
      </div>
    </Panel>
  );
}

function Slider({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="flex justify-between text-mist">
        <span>{label}</span>
        <span className="tabular-nums">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full accent-brass"
      />
    </label>
  );
}
