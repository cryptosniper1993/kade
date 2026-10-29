import { useState } from "react";
import { deleteTask, saveTask, setTaskStatus } from "@/lib/work";
import { formatDay } from "@/lib/day";
import { isLate, personName, projectName } from "@/lib/briefing";
import type { Person, Project, Task, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Button, Select } from "@/components/ui";

const STATUSES: { id: TaskStatus; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "bezig", label: "Bezig" },
  { id: "klaar", label: "Klaar" },
];

export function TaskList({
  tasks,
  people,
  projects,
  today,
  refresh,
  notice,
}: {
  tasks: Task[];
  people: Person[];
  projects: Project[];
  today: string;
  refresh: () => Promise<void>;
  notice: (m: string) => void;
}) {
  const [busy, setBusy] = useState("");

  async function run(id: string, action: () => Promise<unknown>, ok: string) {
    setBusy(id);
    try {
      await action();
      await refresh();
      if (ok) notice(ok);
    } catch (error) {
      notice(error instanceof Error ? error.message : "Dat lukte niet.");
    } finally {
      setBusy("");
    }
  }

  if (tasks.length === 0) {
    return <p className="text-sm text-mist">Niets in deze lijst. Ofwel is het gedaan, ofwel is het nog niet bedacht.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {tasks.map((task) => {
        const late = isLate(task, today);
        return (
          <li key={task.id} className="rounded-md border border-line bg-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs tracking-widest text-mist uppercase">
                  <span className={task.priority === "hoog" ? "text-brass" : ""}>{task.priority}</span>
                  {task.kind === "cip" && <span className="ml-2 text-brass">CIP</span>}
                  {late && <span className="ml-2 text-brass">te laat</span>}
                </p>
                <p className={cn("mt-1 text-base font-medium", task.status === "klaar" && "text-mist line-through")}>{task.title}</p>
                <p className="mt-1 text-sm text-mist">
                  {personName(people, task.assigneeId)}
                  <span className="mx-1.5">·</span>
                  {projectName(projects, task.projectId)}
                  {task.dueOn && (
                    <>
                      <span className="mx-1.5">·</span>
                      {formatDay(task.dueOn)}
                    </>
                  )}
                </p>
                {task.kind === "cip" && task.cause && <p className="mt-2 text-sm text-pretty">Aanleiding: {task.cause}</p>}
                {task.detail && <p className="mt-1 text-sm text-mist text-pretty">{task.detail}</p>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {STATUSES.map((status) => (
                <button
                  key={status.id}
                  type="button"
                  disabled={busy === task.id}
                  onClick={() => run(task.id, () => setTaskStatus({ data: { id: task.id, status: status.id } }), "")}
                  className={cn(
                    "min-h-11 rounded-sm border px-3 text-sm",
                    task.status === status.id ? "border-brass bg-brass text-brass-ink" : "border-line text-mist",
                  )}
                >
                  {status.label}
                </button>
              ))}
              <Select
                aria-label="Toewijzen"
                value={task.assigneeId ?? ""}
                disabled={busy === task.id}
                className="w-auto min-w-36"
                onChange={(event) =>
                  run(
                    task.id,
                    () =>
                      saveTask({
                        data: {
                          id: task.id,
                          projectId: task.projectId ?? "",
                          assigneeId: event.target.value,
                          title: task.title,
                          detail: task.detail,
                          kind: task.kind,
                          cause: task.cause,
                          priority: task.priority,
                          dueOn: task.dueOn ?? "",
                        },
                      }),
                    "Toegewezen.",
                  )
                }
              >
                <option value="">Niet toegewezen</option>
                {people.filter((person) => person.active || person.id === task.assigneeId).map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
              <Button variant="ghost" disabled={busy === task.id} onClick={() => run(task.id, () => deleteTask({ data: { id: task.id } }), "Taak weg.")}>
                Weg
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

