import { useState } from "react";
import { sendToGrokBot } from "@/lib/ops-grokbot";
import { parseGrokCommand } from "@/lib/grokbot";
import { Button, Kicker, Panel, TextInput } from "@/components/ui";

/** Opdrachtregel naar Grok Bot. Accepteert vrije tekst of '/grok …'. */
export function GrokCommand({ view, summary, notice }: { view: string; summary?: string; notice: (m: string) => void }) {
  const [line, setLine] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ ok: boolean; detail: string } | null>(null);

  async function send() {
    const opdracht = parseGrokCommand(line) ?? line.trim();
    if (!opdracht) return notice("Typ eerst een opdracht.");
    setBusy(true);
    try {
      const res = await sendToGrokBot({ data: { opdracht, context: { view, samenvatting: summary ?? "" } } });
      setLast({ ok: res.ok, detail: res.detail });
      if (res.ok) setLine("");
      notice(res.ok ? `Verstuurd naar ${res.botName}.` : res.detail);
    } catch (error) {
      notice(error instanceof Error ? error.message : "Versturen lukte niet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="flex flex-col gap-3">
      <Kicker>Grok Bot</Kicker>
      <p className="text-sm text-mist text-pretty">Stuur een opdracht naar je Grok Bot-assistent (ook als <code>/grok …</code>). Het antwoord komt in de Grok Bot-chat; hier zie je enkel of de opdracht aankwam. Dit gaat naar de <strong>actieve</strong> bot; wisselen, bots beheren en per-bot logs vind je in <a className="underline" href="#grokbots">GROK BOTS</a>.</p>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <TextInput className="min-w-0 flex-1" value={line} onChange={(e) => setLine(e.target.value)} placeholder="/grok vat de openstaande facturen samen" />
        <Button disabled={busy} type="submit">{busy ? "Versturen…" : "Stuur naar Grok Bot"}</Button>
      </form>
      {last && <p className={last.ok ? "text-sm text-mist" : "text-sm text-brass"}>{last.detail}</p>}
    </Panel>
  );
}
