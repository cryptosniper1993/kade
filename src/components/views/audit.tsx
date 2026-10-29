import { useEffect, useState } from "react";
import { loadJam, type AuditEntry } from "@/lib/ops-jam";
import { Kicker } from "@/components/ui";

/** Audit log: wie, wat, wanneer, goedgekeurd door. Zichtbaar voor Kobe en Nick (het eigen account). */
export function AuditView() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  useEffect(() => { loadJam().then((j) => setRows(j.audit)).catch(() => setRows([])); }, []);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Kicker>Audit</Kicker>
        <h1 className="mt-2 font-display text-5xl">Wie deed wat, en wie keurde goed.</h1>
      </header>
      {!rows ? <p className="text-mist">Laden…</p> : rows.length === 0 ? <p className="text-sm text-mist">Nog niets gelogd.</p> : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs tracking-widest text-mist uppercase"><tr><th className="p-2">Wanneer</th><th className="p-2">Wie</th><th className="p-2">Actie</th><th className="p-2">Object</th><th className="p-2">Detail</th><th className="p-2">Goedgekeurd door</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t border-line"><td className="p-2 whitespace-nowrap">{new Date(r.at).toLocaleString("nl-BE")}</td><td className="p-2">{r.actor}</td><td className="p-2">{r.action}</td><td className="p-2">{r.object}</td><td className="p-2">{r.detail}</td><td className="p-2">{r.approvedBy}</td></tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}
