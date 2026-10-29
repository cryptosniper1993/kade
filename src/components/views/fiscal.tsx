import { useState } from "react";
import { askSchaar } from "@/lib/ops";
import type { Desk } from "@/lib/types";
import { Button, Kicker } from "@/components/ui";

const prompts = [
  "Loont een elektrische leasewagen nog in 2026, of een brandstofwagen?",
  "Een klantenevent: wat is aftrekbaar en wat is verworpen?",
  "Welke investering dit jaar, welke over drie jaar?",
  "Zit de bezoldiging aan 50.000 euro voor het verlaagd tarief?",
];

export function FiscalView({ desk, refresh, notice }: { desk: Desk; refresh: () => Promise<void>; notice: (m: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(value: string) {
    const message = value.trim();
    if (!message) return;
    setBusy(true);
    setText("");
    try {
      const result = await askSchaar({ data: { text: message } });
      await refresh();
      if (!result.ok) notice(result.text);
    } catch (error) {
      notice(error instanceof Error ? error.message : "Schaar zwijgt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col gap-6">
      <header>
        <Kicker>Finance · Schaar</Kicker>
        <h1 className="mt-2 font-display text-5xl">Zo weinig mogelijk. Wettelijk.</h1>
        <p className="mt-2 max-w-xl text-mist text-pretty">
          Eén taak: de druk omlaag. Lease, een klantenevent, een investering op korte, middellange of lange termijn. Geen verzonnen factuur, geen privé op de zaak. Hij dient niets in.
        </p>
      </header>
      <div className="flex flex-1 flex-col gap-4">
        {desk.fiscal.length === 0 && (
          <p className="font-display text-3xl">Zeg waar het geld nu naartoe lekt.</p>
        )}
        {desk.fiscal.map((message) => (
          <article key={message.id} className={message.role === "assistant" ? "max-w-3xl" : "ml-auto max-w-xl rounded-md bg-raised px-4 py-3"}>
            <p className="text-xs tracking-widest text-mist uppercase">{message.role === "assistant" ? "Schaar" : "Jij"}</p>
            <p className="mt-1 whitespace-pre-wrap text-pretty">{message.content}</p>
          </article>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <button key={prompt} type="button" className="min-h-11 rounded-sm border border-line px-3 text-left text-sm text-mist hover:border-brass hover:text-ivory" onClick={() => send(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Vraag aan Schaar"
          className="min-h-11 flex-1 rounded-sm border border-line bg-ink px-3 text-sm outline-none focus:border-brass"
        />
        <Button type="submit" disabled={busy}>{busy ? "Rekent…" : "Stuur"}</Button>
      </form>
    </div>
  );
}
