import { useState } from "react";
import { searchMail } from "@/lib/ops";
import { redirectToLoginIfRequired } from "@/lib/app-data/login";
import { classifyCallToolError } from "@/lib/app-data/errors";
import { useRefetchWhenConnectorReady } from "@/lib/app-data/use-connector-readiness";
import { Button, Field, Kicker, Panel, TextInput } from "@/components/ui";

type Hit = { title: string; from: string; date: string; snippet: string };

export function MailView() {
  const [provider, setProvider] = useState<"gmail" | "outlook">("gmail");
  const [query, setQuery] = useState("newer_than:21d");
  const [items, setItems] = useState<Hit[]>([]);
  const [note, setNote] = useState("Koppel Gmail of Outlook in Grok. Daarna haal je de post hier op, op jouw teken.");
  const [loginUrl, setLoginUrl] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const result = await searchMail({ data: { provider, query } });
      setPending(Boolean(result.pending));
      setLoginUrl(result.loginUrl);
      if (result.ok) {
        setItems(result.items);
        setNote(result.items.length ? `${result.items.length} berichten.` : result.rawHint ? "De connector antwoordde, maar zonder leesbare berichten." : "Geen berichten voor die zoekopdracht.");
      } else {
        setItems([]);
        const state = classifyCallToolError({
          ok: false,
          data: null,
          pending: result.pending,
          loginRequired: result.loginRequired,
          errorMessage: result.errorMessage,
          loginUrl: result.loginUrl,
        });
        setNote(state?.message ?? result.errorMessage ?? "Post ophalen mislukt.");
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Post ophalen mislukt.");
    } finally {
      setBusy(false);
    }
  }

  useRefetchWhenConnectorReady(pending, load);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Kicker>Post</Kicker>
        <h1 className="mt-2 font-display text-5xl">De inbox, aan de kade.</h1>
        <p className="mt-2 max-w-xl text-mist text-pretty">
          Gmail en Outlook lopen via je Grok-koppeling. Zoek zoals in de mailbox: from:, subject:, newer_than:7d, has:attachment.
        </p>
      </header>
      <Panel className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button variant={provider === "gmail" ? "primary" : "ghost"} onClick={() => setProvider("gmail")}>Gmail</Button>
          <Button variant={provider === "outlook" ? "primary" : "ghost"} onClick={() => setProvider("outlook")}>Outlook</Button>
        </div>
        <Field label="Zoekopdracht">
          <TextInput value={query} onChange={(e) => setQuery(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={load}>{busy ? "Ophalen…" : "Haal post op"}</Button>
          {loginUrl && (
            <Button variant="ghost" onClick={() => redirectToLoginIfRequired({ ok: false, data: null, loginRequired: true, loginUrl })}>
              Doorgaan met Grok
            </Button>
          )}
        </div>
        <p className="text-sm text-mist">{note}</p>
      </Panel>
      <ul className="flex flex-col gap-3">
        {items.map((item, index) => (
          <li key={`${item.title}-${index}`} className="rounded-md border border-line bg-raised p-4">
            <p className="text-xs text-mist">{item.from} {item.date && `· ${item.date}`}</p>
            <p className="mt-1 font-display text-2xl">{item.title}</p>
            {item.snippet && <p className="mt-2 text-sm text-mist text-pretty">{item.snippet}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
