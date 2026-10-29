import { useEffect, useState } from "react";
import { saveProjectMeta } from "@/lib/ops-jam";
import { PROJECT_PHASES } from "@/lib/outreach";
import type { Project } from "@/lib/types";
import { Area, Button, Field, Kicker, Panel, Select, TextInput } from "@/components/ui";

/** Fase, contacten, volgende actie, gekoppelde projectbot en vertrouwelijk-vlag van een project. */
export function ProjectMeta({ project, refresh, notice }: { project: Project; refresh: () => Promise<void>; notice: (m: string) => void }) {
  const [m, setM] = useState({ phase: project.phase, confidential: project.confidential, contacts: project.contacts, nextAction: project.nextAction, botId: project.botId });
  const [busy, setBusy] = useState(false);
  useEffect(() => setM({ phase: project.phase, confidential: project.confidential, contacts: project.contacts, nextAction: project.nextAction, botId: project.botId }), [project.id]);
  return (
    <Panel className="grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2 flex items-center gap-2">
        <Kicker>Klantproject</Kicker>
        {project.confidential && <span className="rounded-sm bg-brass px-2 text-xs text-brass-ink">VERTROUWELIJK</span>}
      </div>
      <Field label="Fase">
        <Select value={m.phase} onChange={(e) => setM({ ...m, phase: e.target.value })}>
          <option value="">—</option>
          {PROJECT_PHASES.map((p) => <option key={p} value={p}>{p.replace(/_/g, " ")}</option>)}
        </Select>
      </Field>
      <Field label="Gekoppelde projectbot (Grok Bot-id)"><TextInput value={m.botId} onChange={(e) => setM({ ...m, botId: e.target.value })} /></Field>
      <Field label="Contacten"><Area rows={2} value={m.contacts} onChange={(e) => setM({ ...m, contacts: e.target.value })} /></Field>
      <Field label="Volgende actie"><Area rows={2} value={m.nextAction} onChange={(e) => setM({ ...m, nextAction: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={m.confidential} onChange={(e) => setM({ ...m, confidential: e.target.checked })} />
        Vertrouwelijk: nooit zichtbaar voor andere projectbots, nooit noemen tegenover andere klanten
      </label>
      <div className="md:col-span-2">
        <Button disabled={busy} onClick={async () => {
          setBusy(true);
          try { await saveProjectMeta({ data: { id: project.id, ...m } }); await refresh(); notice("Project bijgewerkt."); }
          catch (e) { notice(e instanceof Error ? e.message : "Mislukt."); } finally { setBusy(false); }
        }}>Bewaren</Button>
      </div>
    </Panel>
  );
}
