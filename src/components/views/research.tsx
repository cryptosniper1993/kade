import { useState } from "react";
import { askResearch } from "@/lib/ops";
import type { Desk } from "@/lib/types";
import { Button, Kicker, Panel, Area } from "@/components/ui";

export function ResearchView({ desk, refresh, notice }: { desk: Desk; refresh: () => Promise<void>; notice: (m: string) => void }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(desk.researches[0]?.id ?? "");
  const selected = desk.researches.find((item) => item.id === current) ?? desk.researches[0];

  async function ask() {
    setBusy(true);
    try {
      const result = await askResearch({ data: { question } });
      if (!result.ok) {
        notice(result.error);
        return;
      }
      setQuestion("");
      await refresh();
      setCurrent("");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Research mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Kicker>Research</Kicker>
        <h1 className="mt-2 font-display text-5xl">Vraag het hardop.</h1>
        <p className="mt-2 max-w-xl text-mist">Live via Grok. Hij verzint geen bronnen. Wat hij niet weet, moet hij zeggen.</p>
      </header>
      <Panel className="flex flex-col gap-3">
        <Area value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Bijvoorbeeld: welke stack is redelijk voor een kleine WMS-koppeling, en wat kost zo’n project in België?" />
        <Button disabled={busy} onClick={ask}>{busy ? "Zoekt…" : "Onderzoek"}</Button>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-3">
        <ul className="flex flex-col gap-2">
          {desk.researches.length === 0 && <li className="text-sm text-mist">Nog geen onderzoeken.</li>}
          {desk.researches.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => setCurrent(item.id)} className="w-full rounded-sm border border-line px-3 py-3 text-left hover:border-brass">
                <span className="block font-medium">{item.title}</span>
              </button>
            </li>
          ))}
        </ul>
        <article className="lg:col-span-2">
          {selected ? (
            <div>
              <h2 className="font-display text-4xl">{selected.title}</h2>
              <p className="mt-4 whitespace-pre-wrap text-pretty">{selected.answer}</p>
            </div>
          ) : (
            <p className="text-mist">Het antwoord landt hier.</p>
          )}
        </article>
      </div>
    </div>
  );
}
