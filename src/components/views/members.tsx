import { useCallback, useEffect, useState } from "react";
import { inviteMember, loadMembers, removeMember, setMemberRole } from "@/lib/ops";
import type { MembersView } from "@/lib/ops-members";
import { ROLES, ROLE_LABELS, STEP_LABELS, type Role } from "@/lib/auth/permissions";
import { Button, Field, Panel, Select, TextInput } from "@/components/ui";

export function MembersSettings({ notice }: { notice: (m: string) => void }) {
  const [view, setView] = useState<MembersView | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("medewerker");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setView(await loadMembers());
    } catch (error) {
      notice(error instanceof Error ? error.message : "Leden laden mislukt.");
    }
  }, [notice]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await action();
      await reload();
      notice(ok);
    } catch (error) {
      notice(error instanceof Error ? error.message : "Dat lukte niet.");
    } finally {
      setBusy(false);
    }
  }

  const manage = view?.steps.includes("beheer") ?? false;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-3xl">Leden en rollen</h2>
      <p className="max-w-xl text-sm text-mist text-pretty">
        Jouw rol: <strong>{view ? ROLE_LABELS[view.role] : "…"}</strong>.
        {view && view.steps.length ? ` Je mag: ${view.steps.map((s) => STEP_LABELS[s].toLowerCase()).join(", ")}.` : view ? " Je kunt alles bekijken, niets wijzigen." : ""}
      </p>
      <Panel className="flex max-w-xl flex-col gap-2 text-sm">
        {view?.members.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-2">
            <span className="min-w-48 flex-1">
              {m.email || "(dit account)"}
              {m.me ? " · jij" : ""}
              {m.pending ? " · uitgenodigd" : ""}
            </span>
            {manage ? (
              <>
                <Select
                  value={m.role}
                  disabled={busy}
                  aria-label={`Rol van ${m.email}`}
                  onChange={(e) => run(() => setMemberRole({ data: { id: m.id, role: e.target.value } }), "Rol aangepast.")}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </Select>
                <Button disabled={busy} onClick={() => run(() => removeMember({ data: { id: m.id } }), "Lid verwijderd.")}>
                  Verwijderen
                </Button>
              </>
            ) : (
              <span className="text-mist">{ROLE_LABELS[m.role]}</span>
            )}
          </div>
        ))}
      </Panel>
      {manage ? (
        <Panel className="flex max-w-xl flex-col gap-3">
          <Field label="E-mailadres">
            <TextInput type="email" value={email} maxLength={160} onChange={(e) => setEmail(e.target.value)} placeholder="boekhouder@voorbeeld.be" />
          </Field>
          <Field label="Rol">
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </Select>
          </Field>
          <Button
            disabled={busy || !email}
            onClick={() => run(async () => { await inviteMember({ data: { email, role } }); setEmail(""); }, "Uitgenodigd. Meld je aan met dat adres om binnen te komen.")}
          >
            Uitnodigen
          </Button>
        </Panel>
      ) : null}
    </section>
  );
}
