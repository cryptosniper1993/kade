import { useEffect, useState } from "react";
import { clearGrokKey, loadGrokBot, saveGrokBot, sendToGrokBot, type GrokStatus } from "@/lib/ops-grokbot";
import { Button, Field, Panel, Select, TextInput } from "@/components/ui";

export function GrokBotSettings({ notice }: { notice: (m: string) => void }) {
  const [status, setStatus] = useState<GrokStatus | null>(null);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [mode, setMode] = useState<"bearer" | "custom">("bearer");
  const [headerName, setHeaderName] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { status: next } = await loadGrokBot();
    setStatus(next);
    setUrl(next.webhookUrl);
    setMode(next.headerMode);
    setHeaderName(next.headerName);
  }

  useEffect(() => {
    load().catch(() => notice("De Grok Bot-instellingen konden niet laden."));
  }, []);

  async function save() {
    setBusy(true);
    try {
      await saveGrokBot({ data: { webhookUrl: url, senderKey: key, headerMode: mode, headerName } });
      setKey("");
      await load();
      notice("Grok Bot-koppeling bewaard.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Bewaren lukte niet.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const res = await sendToGrokBot({ data: { opdracht: "", test: true, context: { view: "instellingen" } } });
      await load();
      notice(res.ok ? `Verbinding werkt (HTTP ${res.status}).` : res.detail);
    } finally {
      setBusy(false);
    }
  }

  const state = !status?.configured
    ? "Niet gekoppeld"
    : status.lastStatus == null
      ? "Gekoppeld, nog niet getest"
      : status.lastStatus >= 200 && status.lastStatus < 300
        ? `Werkt (HTTP ${status.lastStatus})`
        : `Fout bij laatste poging (HTTP ${status.lastStatus})`;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-3xl">Grok Bot</h2>
      <p className="max-w-xl text-sm text-mist text-pretty">
        Stuur opdrachten vanuit KADE naar je Grok Bot-assistent. Maak in Grok Bot een routine met een webhook-trigger en kopieer de webhook-URL en de sender key uit het routinepaneel. De sleutel blijft op de server en wordt na bewaren niet meer getoond. Het antwoord komt in de Grok Bot-chat, niet hier.
      </p>
      <Panel className="flex max-w-xl flex-col gap-3">
        <p className="text-sm">Status: <span className="text-brass">{state}</span>{status?.lastCheckedAt ? <span className="text-mist"> · {new Date(status.lastCheckedAt).toLocaleString("nl-BE")}</span> : null}</p>
        <Field label="Webhook-URL">
          <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoComplete="off" />
        </Field>
        <Field label={status?.keyMasked ? `Sender key (bewaard: ${status.keyMasked}, leeg laten om te behouden)` : "Sender key"}>
          <TextInput type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Hoe de sleutel meesturen">
          <Select value={mode} onChange={(e) => setMode(e.target.value === "custom" ? "custom" : "bearer")}>
            <option value="bearer">Authorization: Bearer &lt;sleutel&gt;</option>
            <option value="custom">Eigen header</option>
          </Select>
        </Field>
        {mode === "custom" && (
          <Field label="Headernaam">
            <TextInput value={headerName} onChange={(e) => setHeaderName(e.target.value)} placeholder="X-Sender-Key" />
          </Field>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={save}>{busy ? "Bezig…" : "Bewaren"}</Button>
          <Button variant="ghost" disabled={busy || !status?.configured} onClick={test}>Test verbinding</Button>
          {status?.keyMasked && (
            <Button variant="ghost" disabled={busy} onClick={async () => { await clearGrokKey(); await load(); notice("Sleutel gewist."); }}>Sleutel wissen</Button>
          )}
        </div>
      </Panel>
    </section>
  );
}
