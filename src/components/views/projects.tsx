import { useState } from "react";
import { saveProject, saveTask, setProjectStatus } from "@/lib/work";
import { brusselsToday, formatDay } from "@/lib/day";
import { priorityQueue, projectProgress } from "@/lib/briefing";
import type { Desk, Project, ProjectStatus, TaskPriority } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Button, Field, Kicker, Panel, Select, TextInput } from "@/components/ui";
import { TaskList } from "@/components/views/task-list";
import { ProjectMeta } from "@/components/views/project-meta";

const STATUSES: { id: ProjectStatus; label: string }[] = [
  { id: "actief", label: "Actief" },
  { id: "pauze", label: "Pauze" },
  { id: "klaar", label: "Klaar" },
];

export function ProjectsView({ desk, refresh, notice }: { desk: Desk; refresh: () => Promise<void>; notice: (m: string) => void }) {
  const today = brusselsToday();
  const [openId, setOpenId] = useState(desk.projects[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ name: "", clientName: "", note: "", dueOn: "" });
  const [task, setTask] = useState({ title: "", assigneeId: "", priority: "normaal" as TaskPriority, dueOn: "", kind: "todo" as "todo" | "cip" });

  const selected = desk.projects.find((project) => project.id === openId) ?? null;
  const projectTasks = selected ? priorityQueue(desk.tasks.filter((item) => item.projectId === selected.id && item.status !== "klaar"), today) : [];
  const doneTasks = selected ? desk.tasks.filter((item) => item.projectId === selected.id && item.status === "klaar") : [];

  async function createProject() {
    setBusy(true);
    try {
      const result = await saveProject({ data: { ...draft, status: "actief" } });
      setDraft({ name: "", clientName: "", note: "", dueOn: "" });
      setOpenId(result.id);
      await refresh();
      notice("Project staat open.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Opslaan mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function addTask(project: Project) {
    setBusy(true);
    try {
      await saveTask({
        data: {
          title: task.title,
          detail: "",
          cause: "",
          kind: task.kind,
          priority: task.priority,
          assigneeId: task.assigneeId,
          projectId: project.id,
          dueOn: task.dueOn,
        },
      });
      setTask({ title: "", assigneeId: "", priority: "normaal", dueOn: "", kind: "todo" });
      await refresh();
      notice("Taak hangt aan het project.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Opslaan mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Kicker>Projecten</Kicker>
        <h1 className="mt-2 font-display text-5xl">Eén lijst per project.</h1>
        <p className="mt-2 max-w-xl text-mist text-pretty">Voortgang is klaar gedeeld door alles wat eraan hangt. Een project zonder taken is een voornemen, geen percentage.</p>
      </header>

      <Panel className="grid gap-3 md:grid-cols-2">
        <Field label="Project">
          <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Naam" />
        </Field>
        <Field label="Voor wie">
          <TextInput value={draft.clientName} onChange={(e) => setDraft({ ...draft, clientName: e.target.value })} placeholder="Klant of intern, optioneel" />
        </Field>
        <Field label="Notitie">
          <TextInput value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Wat af is, is af" />
        </Field>
        <Field label="Streefdatum">
          <TextInput type="date" value={draft.dueOn} onChange={(e) => setDraft({ ...draft, dueOn: e.target.value })} />
        </Field>
        <div className="md:col-span-2">
          <Button disabled={busy} onClick={createProject}>Project openen</Button>
        </div>
      </Panel>

      {desk.projects.length === 0 ? (
        <p className="text-sm text-mist">Nog geen projecten. De losse taken blijven op Taken staan.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {desk.projects.map((project) => {
            const progress = projectProgress(desk.tasks, project.id);
            const on = project.id === selected?.id;
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => setOpenId(project.id)}
                className={cn("rounded-md border p-4 text-left", on ? "border-brass bg-raised" : "border-line bg-panel")}
              >
                <p className="text-xs tracking-widest text-mist uppercase">{project.status}{project.phase ? ` · ${project.phase.replace(/_/g, " ")}` : ""}{project.confidential ? " · vertrouwelijk" : ""}</p>
                <p className="mt-1 font-display text-3xl">{project.name}</p>
                <p className="mt-1 text-sm text-mist">
                  {project.clientName || "Geen opdrachtgever"}
                  {project.dueOn ? ` · ${formatDay(project.dueOn)}` : ""}
                </p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-sm bg-ink">
                  <div className="h-full bg-brass" style={{ width: `${progress.pct}%` }} />
                </div>
                <p className="mt-2 text-sm tabular-nums text-mist">
                  {progress.done}/{progress.total} klaar · {progress.pct}%
                </p>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <section className="flex flex-col gap-4">
          <ProjectMeta project={selected} refresh={refresh} notice={notice} />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Kicker>Todo van dit project</Kicker>
              <h2 className="mt-2 font-display text-4xl">{selected.name}</h2>
              {selected.note && <p className="mt-1 max-w-xl text-sm text-mist">{selected.note}</p>}
            </div>
            <div className="flex gap-2">
              {STATUSES.map((status) => (
                <button
                  key={status.id}
                  type="button"
                  onClick={() =>
                    setProjectStatus({ data: { id: selected.id, status: status.id } })
                      .then(refresh)
                      .catch((error: unknown) => notice(error instanceof Error ? error.message : "Dat lukte niet."))
                  }
                  className={cn(
                    "min-h-11 rounded-sm border px-3 text-sm",
                    selected.status === status.id ? "border-brass bg-brass text-brass-ink" : "border-line text-mist",
                  )}
                >
                  {status.label}
                </button>
              ))}
            </div>
          </div>

          <Panel className="grid gap-3 md:grid-cols-4">
            <Field label={task.kind === "cip" ? "CIP-maatregel" : "Taak"}>
              <TextInput value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} placeholder="Wat moet af" />
            </Field>
            <Field label="Soort">
              <Select value={task.kind} onChange={(e) => setTask({ ...task, kind: e.target.value as "todo" | "cip" })}>
                <option value="todo">Todo</option>
                <option value="cip">CIP</option>
              </Select>
            </Field>
            <Field label="Persoon">
              <Select value={task.assigneeId} onChange={(e) => setTask({ ...task, assigneeId: e.target.value })}>
                <option value="">Niet toegewezen</option>
                {desk.people.filter((item) => item.active).map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Prio">
              <Select value={task.priority} onChange={(e) => setTask({ ...task, priority: e.target.value as TaskPriority })}>
                <option value="hoog">Hoog</option>
                <option value="normaal">Normaal</option>
                <option value="laag">Laag</option>
              </Select>
            </Field>
            <Field label="Deadline">
              <TextInput type="date" value={task.dueOn} onChange={(e) => setTask({ ...task, dueOn: e.target.value })} />
            </Field>
            <div className="flex items-end">
              <Button disabled={busy} onClick={() => addTask(selected)}>Toevoegen</Button>
            </div>
          </Panel>

          <TaskList tasks={projectTasks} people={desk.people} projects={desk.projects} today={today} refresh={refresh} notice={notice} />
          {doneTasks.length > 0 && (
            <div className="flex flex-col gap-3">
              <Kicker>Al klaar</Kicker>
              <TaskList tasks={doneTasks} people={desk.people} projects={desk.projects} today={today} refresh={refresh} notice={notice} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
