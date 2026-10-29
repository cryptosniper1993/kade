import { useEffect, useState } from "react";
import { loadGrokBot, type GrokLogEntry } from "@/lib/ops-grokbot";

export function GrokLog() {
  const [log, setLog] = useState<GrokLogEntry[] | null>(null);
  useEffect(() => {
    loadGrokBot().then((r) => setLog(r.log)).catch(() => setLog([]));
  }, []);
  if (!log) return <p className="text-sm text-mist">Laden…</p>;
  if (log.length === 0) return <p className="text-sm text-mist">Nog geen opdrachten naar Grok Bot gestuurd.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {log.map((item) => (
        <li key={item.id} className="rounded-sm border border-line px-3 py-3">
          <p className="text-xs tracking-widest text-mist uppercase">
            {new Date(item.createdAt).toLocaleString("nl-BE")} · {item.view || "—"} ·{" "}
            <span className={item.ok ? "text-ivory" : "text-brass"}>{item.status == null ? "niet bereikt" : `HTTP ${item.status}`}</span>
          </p>
          <p className="mt-1 whitespace-pre-wrap text-pretty">{item.opdracht}</p>
          {item.detail && <p className="mt-1 text-sm text-mist">{item.detail}</p>}
        </li>
      ))}
    </ul>
  );
}
