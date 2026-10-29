import type { Person, Project, Task } from "@/lib/types";

export function personName(people: Person[], id: string | null): string {
  if (!id) return "Niet toegewezen";
  return people.find((person) => person.id === id)?.name ?? "Onbekend";
}

export function projectName(projects: Project[], id: string | null): string {
  if (!id) return "Los";
  return projects.find((project) => project.id === id)?.name ?? "Project weg";
}

export function isOpen(task: Task): boolean {
  return task.status !== "klaar";
}

export function isLate(task: Task, today: string): boolean {
  return isOpen(task) && Boolean(task.dueOn) && (task.dueOn as string) < today;
}

export function taskRank(task: Task, today: string): number {
  const priority = task.priority === "hoog" ? 0 : task.priority === "normaal" ? 1 : 2;
  const due = !task.dueOn ? 3 : task.dueOn < today ? 0 : task.dueOn === today ? 1 : 2;
  const cip = task.kind === "cip" ? 0 : 1;
  return priority * 20 + due * 2 + cip;
}

export function priorityQueue(tasks: Task[], today: string): Task[] {
  return tasks.filter(isOpen).slice().sort((a, b) => {
    const rank = taskRank(a, today) - taskRank(b, today);
    if (rank !== 0) return rank;
    return (a.dueOn ?? "9999-99-99").localeCompare(b.dueOn ?? "9999-99-99");
  });
}

export function projectProgress(tasks: Task[], projectId: string): { done: number; total: number; pct: number } {
  const mine = tasks.filter((task) => task.projectId === projectId);
  const total = mine.length;
  const done = mine.filter((task) => task.status === "klaar").length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}
