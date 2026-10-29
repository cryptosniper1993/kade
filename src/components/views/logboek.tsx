import { useState } from "react";
import type { Desk } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Kicker } from "@/components/ui";
import { GrokLog } from "@/components/grokbot/log";

type Kind = "research" | "bots" | "agents" | "grok";

function when(value: string): string {
  const day = value.slice(0, 10);
  const [y, m, d] = day.split("-");
  if (!y || !m || !d) return value;
  const time = value.length >= 16 ? value.slice(11, 16) : "";
  return time ? `${d}/${m}/${y} ${time}` : `${d}/${m}/${y}`;
}

export function LogboekView({ desk }: { desk: Desk }) {
  const [kind, setKind] = useState<Kind>("research");
  const [current, setCurrent] = useState("");

  const research = desk.researches;
  const runs = desk.runs;
  const agents = [
    ...desk.messages.map((item) => ({ ...item, who: "Loots" })),
    ...desk.fiscal.map((item) => ({ ...item, who: "Schaar" })),
    ...desk.hoofd.map((item) => ({ ...item, who: desk.voice.agentName || "Jarvis" })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const empty = kind === "grok" ? false : kind === "research" ? research.length === 0 : kind === "bots" ? runs.length === 0 : agents.length === 0;
  const selectedResearch = research.find((item) => item.id === current) ?? research[0];
  const selectedRun = runs.find((item) => item.id === current) ?? runs[0];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Kicker>Logboek</Kicker>
        <h1 className="mt-2 font-display text-5xl">Wat er gezegd is, blijft.</h1>
        <p className="mt-2 max-w-xl text-mist text-pretty">Research, botopdrachten en de gesprekken met Loots, Schaar en de hoofdstem. Bonnen en facturen blijven in het archief.</p>
      </header>
      <div className="flex gap-2 overflow-x-auto">
        {([
          ["research", "Research"],
          ["bots", "Bots"],
          ["agents", "Agents"],
          ["grok", "Grok Bot"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => { setKind(id); setCurrent(""); }}
            className={cn("min-h-11 shrink-0 rounded-sm px-3 text-sm", kind === id ? "bg-brass text-brass-ink" : "border border-line text-mist")}
          >
            {label}
          </button>
        ))}
      </div>
      {empty && <p className="text-sm text-mist">Nog niets in dit vak. Een gesprek landt hier vanzelf.</p>}
      {kind === "grok" && <GrokLog />}
      {kind === "research" && research.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <ul className="flex flex-col gap-2">
            {research.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => setCurrent(item.id)} className={cn("w-full rounded-sm border px-3 py-3 text-left", selectedResearch?.id === item.id ? "border-brass" : "border-line")}>
                  <span className="block font-medium">{item.title}</span>
                  <span className="block text-xs text-mist">{when(item.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
          {selectedResearch && (
            <article className="lg:col-span-2">
              <h2 className="font-display text-4xl">{selectedResearch.title}</h2>
              <p className="mt-3 text-sm text-mist">{selectedResearch.question}</p>
              <p className="mt-4 whitespace-pre-wrap text-pretty">{selectedResearch.answer}</p>
            </article>
          )}
        </div>
      )}
      {kind === "bots" && runs.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <ul className="flex flex-col gap-2">
            {runs.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => setCurrent(item.id)} className={cn("w-full rounded-sm border px-3 py-3 text-left", selectedRun?.id === item.id ? "border-brass" : "border-line")}>
                  <span className="block text-xs tracking-widest text-brass uppercase">{item.botName}</span>
                  <span className="mt-1 block font-medium">{item.task}</span>
                  <span className="block text-xs text-mist">{when(item.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
          {selectedRun && (
            <article className="lg:col-span-2">
              <p className="text-xs tracking-widest text-brass uppercase">{selectedRun.botName}</p>
              <h2 className="mt-2 font-display text-4xl">{selectedRun.task}</h2>
              <p className="mt-4 whitespace-pre-wrap text-pretty">{selectedRun.result}</p>
            </article>
          )}
        </div>
      )}
      {kind === "agents" && agents.length > 0 && (
        <div className="flex flex-col gap-4">
          {agents.map((item) => (
            <article key={item.id} className={item.role === "assistant" ? "max-w-3xl" : "ml-auto max-w-xl rounded-md bg-raised px-4 py-3"}>
              <p className="text-xs tracking-widest text-mist uppercase">{item.role === "assistant" ? item.who : "Jij"} · {when(item.createdAt)}</p>
              <p className="mt-1 whitespace-pre-wrap text-pretty">{item.content}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
