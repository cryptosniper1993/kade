import { useEffect, useState } from "react";
import { peppolConfig, testPeppol } from "@/lib/ops";
import { peppolIdFromKbo } from "@/lib/peppol";
import type { Desk } from "@/lib/types";
import { Button, Panel } from "@/components/ui";

export function PeppolSettings({ desk, notice }: { desk: Desk; notice: (m: string) => void }) {
  const [config, setConfig] = useState<{ configured: boolean; provider: string; host: string } | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const ownId = peppolIdFromKbo(desk.company?.enterpriseNumber || desk.company?.vatNumber || "");

  useEffect(() => {
    peppolConfig().then(setConfig).catch(() => setConfig({ configured: false, provider: "", host: "" }));
  }, []);

  async function test() {
    setBusy(true);
    try {
      const res = await testPeppol();
      setConnected(res.ok);
      notice(res.message);
    } finally {
      setBusy(false);
    }
  }

  const status = connected === true ? "verbonden" : config?.configured ? "ingesteld, nog niet getest" : "niet verbonden";
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-3xl">Peppol</h2>
      <p className="max-w-xl text-sm text-mist text-pretty">
        Sinds 1 januari 2026 zijn B2B-facturen tussen Belgische btw-plichtigen gestructureerde e-facturen, in de praktijk via Peppol.
        Kade maakt de UBL (Peppol BIS Billing 3.0) zelf. Verzenden en ontvangen loopt via een erkende Peppol-dienstverlener (access point);
        daarvoor heb je een eigen account bij zo'n provider nodig.
      </p>
      <Panel className="flex max-w-xl flex-col gap-2 text-sm">
        <p><span className="text-mist">Eigen Peppol-ID</span> {ownId || "— vul je ondernemingsnummer in op de zaakfiche"}</p>
        <p><span className="text-mist">Provider</span> {config?.configured ? `${config.provider}${config.host ? ` (${config.host})` : ""}` : "geen"}</p>
        <p><span className="text-mist">Status</span> {config ? status : "…"}</p>
        {!config?.configured && (
          <p className="text-mist">
            Verbinden: zet op de server de geheimen <code>PEPPOL_API_URL</code> en <code>PEPPOL_API_KEY</code> (en eventueel <code>PEPPOL_PROVIDER</code>).
            De sleutel komt nooit in de browser.
          </p>
        )}
        <Button className="self-start" variant="ghost" disabled={busy} onClick={test}>{busy ? "Testen…" : "Test verbinding"}</Button>
      </Panel>
    </section>
  );
}
