import { useMemo, useState } from "react";
import { savePerson, saveTask, setPersonActive } from "@/lib/work";
import { brusselsToday } from "@/lib/day";
import { priorityQueue } from "@/lib/briefing";
import type { Desk, TaskKind, TaskPriority } from "@/lib/types";
import { Button, Field, Kicker, Panel, Select, TextInput, Area } from "@/components/ui";
import { cn } from "@/lib/cn";
import { TaskList } from "@/components/views/task-list";

const FILTERS = [
  { id: "open", label: "Open" },
  { id: "prio", label: "Prio" },
  { id: "cip", label: "CIP" },
  { id: "klaar", label: "Klaar" },
  { id: "alles", label: "Alles" },
] as const;

type Filter = (typeof FILTERS)[number]["id"];

const empty = {
  title: "",
  detail: "",
  cause: "",
  kind: "todo" as TaskKind,
  priority: "normaal" as TaskPriority,
  assigneeId: "",
  projectId: "",
  dueOn: "",
};

export function TasksView({ desk, refresh, notice }: { desk: Desk; refresh: () => Promise<void>; notice: (m: string) => void }) {
  const today = brusselsToday();
  const [filter, setFilter] = useState<Filter>("open");
  const [form, setForm] = useState(empty);
  const [person, setPerson] = useState({ name: "", role: "" });
  const [busy, setBusy] = useState(false);

  const tasks = useMemo(() => {
    const ranked = priorityQueue(desk.tasks, today);
    const done = desk.tasks.filter((task) => task.status === "klaar");
    if (filter === "prio") return ranked.filter((task) => task.priority === "hoog");
    if (filter === "cip") return ranked.filter((task) => task.kind === "cip");
    if (filter === "klaar") return done;
    if (filter === "alles") return [...ranked, ...done];
    return ranked;
  }, [desk.tasks, filter, today]);

  async function addTask() {
    setBusy(true);
    try {
      await saveTask({ data: form });
      setForm(empty);
      await refresh();
      notice(form.kind === "cip" ? "CIP staat erop." : "Taak staat erop.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Opslaan mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function addPerson() {
    setBusy(true);
    try {
      await savePerson({ data: person });
      setPerson({ name: "", role: "" });
      await refresh();
      notice("Persoon staat op de kade.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Opslaan mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Kicker>Taken</Kicker>
        <h1 className="mt-2 font-display text-5xl">Wat blijft liggen, blijft van iemand.</h1>
        <p className="mt-2 max-w-xl text-mist text-pretty">
          Todo of CIP. Een CIP is een verbeterpunt: aanleiding, maatregel, eigenaar, deadline. Toegewezen aan iemand op deze kade, niet aan een naam in de kantlijn.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Panel className="flex flex-col gap-3">
            <Kicker>{form.kind === "cip" ? "Nieuw CIP" : "Nieuwe taak"}</Kicker>
            <div className="flex gap-2">
              {(["todo", "cip"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setForm({ ...form, kind })}
                  className={cn("min-h-11 flex-1 rounded-sm border text-sm", form.kind === kind ? "border-brass bg-brass text-brass-ink" : "border-line text-mist")}
                >
                  {kind === "todo" ? "Todo" : "CIP"}
                </button>
              ))}
            </div>
            <Field label={form.kind === "cip" ? "Maatregel" : "Taak"}>
              <TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={form.kind === "cip" ? "Wat er moet veranderen" : "Wat er moet gebeuren"} />
            </Field>
            {form.kind === "cip" && (
              <Field label="Aanleiding">
                <Area value={form.cause} onChange={(e) => setForm({ ...form, cause: e.target.value })} placeholder="Wat liep fout, of wat blijft terugkomen" />
              </Field>
            )}
            <Field label="Notitie">
              <TextInput value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="Optioneel" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Prio">
                <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}>
                  <option value="hoog">Hoog</option>
                  <option value="normaal">Normaal</option>
                  <option value="laag">Laag</option>
                </Select>
              </Field>
              <Field label="Deadline">
                <TextInput type="date" value={form.dueOn} onChange={(e) => setForm({ ...form, dueOn: e.target.value })} />
              </Field>
              <Field label="Persoon">
                <Select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
                  <option value="">Niet toegewezen</option>
                  {desk.people.filter((item) => item.active).map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Project">
                <Select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                  <option value="">Los van een project</option>
                  {desk.projects.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button disabled={busy} onClick={addTask}>Zet op de lijst</Button>
          </Panel>

          <Panel className="flex flex-col gap-3">
            <Kicker>Personen</Kicker>
            <p className="text-sm text-mist">Alleen mensen die je hier zet, kunnen een taak krijgen.</p>
            <Field label="Naam">
              <TextInput value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} placeholder="Naam" />
            </Field>
            <Field label="Rol">
              <TextInput value={person.role} onChange={(e) => setPerson({ ...person, role: e.target.value })} placeholder="Bijvoorbeeld stuurman, dev, boekhouding" />
            </Field>
            <Button variant="ghost" disabled={busy} onClick={addPerson}>Persoon toevoegen</Button>
            <ul className="divide-y divide-line">
              {desk.people.length === 0 && <li className="py-2 text-sm text-mist">Nog niemand. Jij telt ook, als je jezelf toevoegt.</li>}
              {desk.people.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className={cn("block text-sm", !item.active && "text-mist line-through")}>{item.name}</span>
                    {item.role && <span className="block text-xs text-mist">{item.role}</span>}
                  </span>
                  <button
                    type="button"
                    className="min-h-11 text-sm text-mist hover:text-ivory"
                    onClick={() =>
                      setPersonActive({ data: { id: item.id, active: !item.active } })
                        .then(refresh)
                        .catch((error: unknown) => notice(error instanceof Error ? error.message : "Dat lukte niet."))
                    }
                  >
                    {item.active ? "Zet uit" : "Zet aan"}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="lg:col-span-3">
          <div className="mb-4 flex gap-2 overflow-x-auto">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn("min-h-11 shrink-0 rounded-sm px-3 text-sm", filter === item.id ? "bg-brass text-brass-ink" : "border border-line text-mist")}
              >
                {item.label}
              </button>
            ))}
          </div>
          <TaskList tasks={tasks} people={desk.people} projects={desk.projects} today={today} refresh={refresh} notice={notice} />
        </div>
      </div>
    </div>
  );
}
