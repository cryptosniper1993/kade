import { useEffect, useRef, useState } from "react";
import { askHoofd } from "@/lib/ops";
import { canListen, listen, silence, speak } from "@/lib/speech";
import type { Desk } from "@/lib/types";
import { VoiceForm } from "@/components/voice-form";
import { Button, Kicker } from "@/components/ui";

const prompts = [
  "Wat ligt er vandaag open?",
  "Welke storing wacht nog?",
  "Loopt er een lease af?",
  "Waar sta ik fiscaal deze maand?",
];

export function HoofdView({ desk, refresh, notice }: { desk: Desk; refresh: () => Promise<void>; notice: (m: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [tune, setTune] = useState(false);
  const armed = useRef(false);
  const ear = useRef<{ stop: () => void } | null>(null);
  const name = desk.voice.agentName || "Jarvis";

  useEffect(() => () => {
    ear.current?.stop();
    silence();
  }, []);

  useEffect(() => {
    if (!armed.current || !desk.voice.autoSpeak) return;
    const last = desk.hoofd[desk.hoofd.length - 1];
    if (last?.role !== "assistant") return;
    armed.current = false;
    speak(last.content, desk.voice);
  }, [desk.hoofd, desk.voice]);

  async function send(value: string) {
    const message = value.trim();
    if (!message || busy) return;
    setBusy(true);
    setText("");
    armed.current = true;
    try {
      const result = await askHoofd({ data: { text: message } });
      await refresh();
      if (!result.ok) {
        armed.current = false;
        notice(result.text);
        if (desk.voice.autoSpeak) speak(result.text, desk.voice);
      }
    } catch (error) {
      armed.current = false;
      notice(error instanceof Error ? error.message : `${name} zwijgt.`);
    } finally {
      setBusy(false);
    }
  }

  function toggleEar() {
    if (hearing) {
      ear.current?.stop();
      ear.current = null;
      setHearing(false);
      return;
    }
    if (!canListen()) return notice("Deze browser neemt geen spraak op. Typen werkt wel.");
    const handle = listen(
      desk.voice.lang,
      ({ transcript, isFinal }) => {
        setText(transcript);
        if (isFinal && desk.voice.sendOnListen) void send(transcript);
      },
      () => {
        ear.current = null;
        setHearing(false);
      },
    );
    if (!handle) return notice("De microfoon weigerde.");
    ear.current = handle;
    setHearing(true);
  }

  return (
    <div className="flex min-h-[70vh] flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Kicker>Hoofdstem</Kicker>
          <h1 className="mt-2 font-display text-5xl">{name}.</h1>
          <p className="mt-2 max-w-xl text-mist text-pretty">
            Kort genoeg om hardop te volgen. Hij ziet de cijfers, het open werk, de storingen en de inventaris. De stem is die van deze computer, niet van een film.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={toggleEar}>{hearing ? "Stop met luisteren" : "Spreek"}</Button>
          <Button variant="ghost" onClick={silence}>Stil</Button>
          <Button variant="ghost" onClick={() => setTune((open) => !open)}>{tune ? "Stem dicht" : "Stem"}</Button>
        </div>
      </header>
      {hearing && <p className="text-sm text-brass">Luistert. {desk.voice.sendOnListen ? "De zin gaat er meteen door." : "De zin blijft in het veld."}</p>}
      {tune && <VoiceForm desk={desk} refresh={refresh} notice={notice} />}
      <div className="flex flex-1 flex-col gap-4">
        {desk.hoofd.length === 0 && <p className="font-display text-3xl">Zeg wat je wilt weten. Hij heeft de kade al.</p>}
        {desk.hoofd.map((message) => (
          <article key={message.id} className={message.role === "assistant" ? "max-w-3xl" : "ml-auto max-w-xl rounded-md bg-raised px-4 py-3"}>
            <p className="text-xs tracking-widest text-mist uppercase">{message.role === "assistant" ? name : "Jij"}</p>
            <p className="mt-1 whitespace-pre-wrap text-pretty">{message.content}</p>
            {message.role === "assistant" && (
              <button type="button" className="mt-2 text-sm text-mist hover:text-ivory" onClick={() => speak(message.content, desk.voice)}>
                Lees voor
              </button>
            )}
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
          placeholder={hearing ? "Luistert…" : `Vraag aan ${name}`}
          className="min-h-11 flex-1 rounded-sm border border-line bg-ink px-3 text-sm outline-none focus:border-brass"
        />
        <Button type="submit" disabled={busy}>{busy ? "Denkt…" : "Stuur"}</Button>
      </form>
    </div>
  );
}
