import { useState } from "react";
import { deleteBot, runBot, saveBot } from "@/lib/ops";
import type { Bot, Desk } from "@/lib/types";
import { Button, Field, Kicker, Panel, TextInput, Area } from "@/components/ui";

export function BotsView({ desk, refresh, notice }: { desk: Desk; refresh: () => Promise<void>; notice: (m: string) => void }) {
  const [active, setActive] = useState<string | null>(desk.bots.find((b) => b.followed)?.id ?? null);
  const [tasks, setTasks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [brief, setBrief] = useState("");
  const followed = desk.bots.filter((b) => b.followed);
  const rest = desk.bots.filter((b) => !b.followed);

  function taskOf(bot: Bot) {
    return tasks[bot.id] ?? bot.task;
  }

  async function run(bot: Bot) {
    const task = taskOf(bot).trim();
    if (!task) return notice("Geef de bot eerst een opdracht.");
    setBusy(bot.id);
    try {
      const result = await runBot({ data: { id: bot.id, task } });
      await refresh();
      if (!result.ok) notice(result.error);
    } catch (error) {
      notice(error instanceof Error ? error.message : "De bot liep vast.");
    } finally {
      setBusy(null);
    }
  }

  async function follow(bot: Bot, value: boolean) {
    await saveBot({ data: { id: bot.id, name: bot.name, role: bot.role, brief: bot.brief, task: taskOf(bot), followed: value } });
    await refresh();
  }

  async function create() {
    if (!name.trim()) return notice("Een bot zonder naam is een script.");
    await saveBot({ data: { id: "", name, role, brief, task: "", followed: true } });
    setName("");
    setRole("");
    setBrief("");
    await refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Kicker>Bots</Kicker>
        <h1 className="mt-2 font-display text-5xl">Bemanning.</h1>
        <p className="mt-2 max-w-xl text-mist text-pretty">Volg wie je nodig hebt. Geef een opdracht. Ze werken via Grok, met je cijfers erbij, en ze doen niets uit zichzelf.</p>
      </header>
      <section>
        <h2 className="font-display text-3xl">Op de kade</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {followed.map((bot) => (
            <Panel key={bot.id} className={active === bot.id ? "border-brass" : ""}>
              <button type="button" className="w-full text-left" onClick={() => setActive(bot.id)}>
                <p className="text-xs tracking-widest text-brass uppercase">{bot.role}</p>
                <p className="mt-1 font-display text-3xl">{bot.name}</p>
                <p className="mt-2 text-sm text-mist text-pretty">{bot.brief}</p>
              </button>
              <Area className="mt-4" value={taskOf(bot)} placeholder="Opdracht" onChange={(e) => setTasks((prev) => ({ ...prev, [bot.id]: e.target.value }))} />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button disabled={busy === bot.id} onClick={() => run(bot)}>{busy === bot.id ? "Bezig…" : "Uitvoeren"}</Button>
                <Button variant="ghost" onClick={() => follow(bot, false)}>Niet meer volgen</Button>
                <Button variant="ghost" onClick={async () => { await deleteBot({ data: bot.id }); await refresh(); }}>Weg</Button>
              </div>
              {bot.lastResult && <p className="mt-4 border-t border-line pt-4 text-sm whitespace-pre-wrap text-pretty">{bot.lastResult}</p>}
            </Panel>
          ))}
          {followed.length === 0 && <p className="text-sm text-mist">Niemand gevolgd. Haal er een van de lijst.</p>}
        </div>
      </section>
      {rest.length > 0 && (
        <section>
          <h2 className="font-display text-3xl">Aan wal</h2>
          <ul className="mt-3 divide-y divide-line">
            {rest.map((bot) => (
              <li key={bot.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span><span className="font-medium">{bot.name}</span> <span className="text-mist">{bot.role}</span></span>
                <Button variant="ghost" onClick={() => follow(bot, true)}>Volgen</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Panel className="grid gap-3 md:grid-cols-2">
        <Kicker>Nieuwe bot</Kicker>
        <div className="md:col-span-2 grid gap-3 md:grid-cols-2">
          <Field label="Naam"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Rol"><TextInput value={role} onChange={(e) => setRole(e.target.value)} /></Field>
          <div className="md:col-span-2">
            <Field label="Kader"><Area value={brief} onChange={(e) => setBrief(e.target.value)} /></Field>
          </div>
          <Button onClick={create}>Bot aanmaken</Button>
        </div>
      </Panel>
    </div>
  );
}
