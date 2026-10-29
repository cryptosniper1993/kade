import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Archive,
  AudioLines,
  BookOpen,
  Bot,
  BotMessageSquare,
  CheckCheck,
  History,
  Target,
  Boxes,
  Building2,
  ChartColumn,
  Compass,
  FileSignature,
  FileText,
  FileInput,
  FolderKanban,
  ListTodo,
  Mail,
  Scale,
  ScrollText,
  Scissors,
  Search,
  Settings,
  Ship,
  Truck,
  Users,
  type LucideIcon,
  ListChecks,
} from "lucide-react";
import { authEnabled, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import type { AppUser } from "@/lib/auth/use-current-user";
import { loadDesk } from "@/lib/ops";
import type { Desk } from "@/lib/types";
import { DeckLink } from "@/components/deck-link";
import { cn } from "@/lib/cn";
import { AnalysisView } from "@/components/views/analysis";
import { ArchiveView } from "@/components/views/archive";
import { BalanceView } from "@/components/views/balance";
import { BooksView } from "@/components/views/books";
import { BotsView } from "@/components/views/bots";
import { Bridge } from "@/components/views/bridge";
import { CompanyView } from "@/components/views/company";
import { FiscalView } from "@/components/views/fiscal";
import { HoofdView } from "@/components/views/hoofd";
import { InventarisView } from "@/components/views/inventaris";
import { InvoicesView } from "@/components/views/invoices";
import { IncomingView } from "@/components/views/incoming";
import { LogboekView } from "@/components/views/logboek";
import { LootsView } from "@/components/views/loots";
import { MailView } from "@/components/views/mail";
import { PartiesView } from "@/components/views/parties";
import { ProjectsView } from "@/components/views/projects";
import { QuotesView } from "@/components/views/quotes";
import { ResearchView } from "@/components/views/research";
import { SettingsView } from "@/components/views/settings";
import { TasksView } from "@/components/views/tasks";
import { GrokBotsView } from "@/components/views/grok-bots";
import { ProspectsView } from "@/components/views/prospects";
import { ApprovalsView } from "@/components/views/approvals";
import { AuditView } from "@/components/views/audit";
import { SetupView } from "@/components/views/setup";

const GROUPS: { id: string; label: string; items: { id: string; label: string; icon: LucideIcon }[] }[] = [
  { id: "brug", label: "Brug", items: [{ id: "brug", label: "Brug", icon: Ship }] },
  {
    id: "projecten",
    label: "Projectbeheer",
    items: [
      { id: "taken", label: "Taken", icon: ListTodo },
      { id: "projecten", label: "Projecten", icon: FolderKanban },
      { id: "prospectie", label: "Prospectie", icon: Target },
      { id: "goedkeuring", label: "Goedkeuring", icon: CheckCheck },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      { id: "klanten", label: "Klanten", icon: Users },
      { id: "leveranciers", label: "Leveranciers", icon: Truck },
      { id: "offertes", label: "Offertes", icon: FileSignature },
      { id: "facturen", label: "Facturen", icon: FileText },
      { id: "inkomend", label: "Inkomend", icon: FileInput },
      { id: "boeken", label: "Boeken", icon: BookOpen },
      { id: "balans", label: "Balans", icon: Scale },
      { id: "inventaris", label: "Inventaris", icon: Boxes },
      { id: "analyse", label: "Analyse", icon: ChartColumn },
      { id: "schaar", label: "Schaar", icon: Scissors },
      { id: "archief", label: "Archief", icon: Archive },
    ],
  },
  {
    id: "agents",
    label: "Agents",
    items: [
      { id: "hoofd", label: "Hoofd", icon: AudioLines },
      { id: "loots", label: "Loots", icon: Compass },
      { id: "research", label: "Research", icon: Search },
      { id: "bots", label: "Bots", icon: Bot },
      { id: "logboek", label: "Logboek", icon: ScrollText },
      { id: "post", label: "Post", icon: Mail },
    ],
  },
  { id: "grokbots", label: "GROK BOTS", items: [{ id: "grokbots", label: "Grok Bots", icon: BotMessageSquare }] },
  {
    id: "beheer",
    label: "Beheer",
    items: [
      { id: "setup", label: "Setup", icon: ListChecks },
      { id: "zaak", label: "Zaak", icon: Building2 },
      { id: "instellingen", label: "Instellingen", icon: Settings },
      { id: "audit", label: "Audit", icon: History },
    ],
  },
];

const NAV = GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));
const IDS = new Set(NAV.map((item) => item.id));

function groupOf(id: string): string {
  return GROUPS.find((group) => group.items.some((item) => item.id === id))?.id ?? "brug";
}

const subscribe = () => () => {};

export function Terminal({ user }: { user: AppUser }) {
  const [view, setView] = useState("brug");
  const [desk, setDesk] = useState<Desk | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const gate = useSyncExternalStore(subscribe, hasGateSessionMarker, () => false);

  async function refresh() {
    const next = await loadDesk();
    setDesk(next);
  }

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (IDS.has(hash)) setView(hash);
    const onHash = () => {
      const next = window.location.hash.replace("#", "");
      if (IDS.has(next)) setView(next);
    };
    window.addEventListener("hashchange", onHash);
    refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "De terminal kon de boeken niet openen."));
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((open) => !open);
      }
      if (event.key === "Escape") setPalette(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(id: string) {
    setView(id);
    setPalette(false);
    history.replaceState(null, "", `#${id}`);
  }

  function openGroup(id: string) {
    if (groupOf(view) === id) return;
    const next = GROUPS.find((group) => group.id === id)?.items[0]?.id;
    if (next) go(next);
  }

  useEffect(() => {
    document.documentElement.dataset.theme = desk?.theme ?? "kade";
  }, [desk?.theme]);

  useEffect(() => {
    const brand = desk?.brand || "KADE";
    document.title = `${brand} — zaakterminal`;
  }, [desk?.brand]);

  function ping(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4200);
  }

  const filtered = NAV.filter((item) => `${item.group} ${item.label}`.toLowerCase().includes(query.toLowerCase()));
  const demo = user.primaryEmail === "demo@noorderlicht.example";
  const label = demo ? "Demo" : user.displayName || user.primaryEmail || "Account";
  const brand = desk?.brand || "KADE";
  const section = GROUPS.find((group) => group.id === groupOf(view)) ?? GROUPS[0];

  return (
    <div className="min-h-screen bg-ink text-ivory">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <aside className="hidden w-24 shrink-0 flex-col border-r border-line py-4 md:flex">
          <p className="px-3 font-display text-2xl">{brand.slice(0, 1)}</p>
          <nav className="mt-6 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {section.items.map((item) => {
              const Icon = item.icon;
              const on = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.id)}
                  className={cn("mx-2 flex min-h-14 flex-col items-center justify-center rounded-sm text-xs", on ? "bg-raised text-ivory" : "text-mist hover:text-ivory")}
                >
                  <Icon className="size-4" />
                  <span className="mt-1">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          {demo && (
            <p className="border-b border-line bg-raised px-4 py-2 text-sm text-mist md:px-6">
              Demo, zonder account. De cijfers zijn een voorbeeld. Afmelden als je een eigen zaak wilt openen.
            </p>
          )}
          <header className="flex flex-col gap-3 border-b border-line px-4 py-3 md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-display text-2xl leading-none">{brand}</p>
                <p className="text-xs text-mist">{desk?.company?.name ?? "Zaakterminal"}</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <DeckLink />
                <button type="button" onClick={() => setPalette(true)} className="hidden min-h-11 items-center rounded-sm border border-line px-3 text-sm text-mist sm:inline-flex">
                  Zoek ⌘K
                </button>
                <span className="hidden max-w-40 truncate text-sm sm:inline">{label}</span>
                {authEnabled && !gate && (
                  <button
                    type="button"
                    disabled={signingOut}
                    className="min-h-11 rounded-sm border border-line px-3 text-sm"
                    onClick={() => {
                      setSigningOut(true);
                      signOut("/login").catch(() => setSigningOut(false));
                    }}
                  >
                    Afmelden
                  </button>
                )}
              </div>
            </div>
            <nav className="flex gap-2 overflow-x-auto">
              {GROUPS.map((group) => {
                const on = group.id === section.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => openGroup(group.id)}
                    className={cn("min-h-11 shrink-0 rounded-sm px-3 text-sm", on ? "bg-brass text-brass-ink" : "text-mist hover:text-ivory")}
                  >
                    {group.label}
                  </button>
                );
              })}
            </nav>
          </header>
          <nav className="flex gap-2 overflow-x-auto border-b border-line px-3 py-2 md:hidden">
            {section.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className={cn("min-h-11 shrink-0 rounded-sm px-3 text-sm", view === item.id ? "bg-raised text-ivory" : "text-mist")}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
            {error && <p className="mb-4 text-sm text-brass">{error}</p>}
            {!desk && !error && <p className="text-mist">Boeken openen…</p>}
            {desk && view === "brug" && <Bridge desk={desk} go={go} refresh={refresh} notice={ping} />}
            {desk && view === "taken" && <TasksView desk={desk} refresh={refresh} notice={ping} />}
            {desk && view === "projecten" && <ProjectsView desk={desk} refresh={refresh} notice={ping} />}
            {desk && view === "loots" && <LootsView desk={desk} refresh={refresh} notice={ping} />}
            {desk && view === "hoofd" && <HoofdView desk={desk} refresh={refresh} notice={ping} />}
            {desk && view === "research" && <ResearchView desk={desk} refresh={refresh} notice={ping} />}
            {desk && view === "bots" && <BotsView desk={desk} refresh={refresh} notice={ping} />}
            {desk && view === "logboek" && <LogboekView desk={desk} />}
            {desk && view === "schaar" && <FiscalView desk={desk} refresh={refresh} notice={ping} />}
            {desk && view === "offertes" && <QuotesView desk={desk} refresh={refresh} notice={ping} go={go} />}
            {desk && view === "facturen" && <InvoicesView desk={desk} refresh={refresh} notice={ping} />}
            {desk && view === "inkomend" && <IncomingView desk={desk} refresh={refresh} notice={ping} />}
            {desk && view === "klanten" && <PartiesView kind="client" desk={desk} go={go} refresh={refresh} notice={ping} />}
            {desk && view === "leveranciers" && <PartiesView kind="supplier" desk={desk} go={go} refresh={refresh} notice={ping} />}
            {desk && view === "boeken" && <BooksView desk={desk} refresh={refresh} notice={ping} />}
            {desk && view === "balans" && <BalanceView desk={desk} />}
            {desk && view === "inventaris" && <InventarisView desk={desk} refresh={refresh} notice={ping} />}
            {desk && view === "analyse" && <AnalysisView desk={desk} />}
            {desk && view === "archief" && <ArchiveView desk={desk} refresh={refresh} notice={ping} />}
            {desk && view === "post" && <MailView />}
            {desk && view === "zaak" && <CompanyView desk={desk} refresh={refresh} notice={ping} />}
            {desk && view === "instellingen" && <SettingsView desk={desk} refresh={refresh} notice={ping} go={go} />}
            {desk && view === "grokbots" && <GrokBotsView desk={desk} notice={ping} />}
            {desk && view === "prospectie" && <ProspectsView refresh={refresh} notice={ping} go={go} />}
            {desk && view === "goedkeuring" && <ApprovalsView notice={ping} />}
            {desk && view === "audit" && <AuditView />}
            {desk && view === "setup" && <SetupView desk={desk} notice={ping} go={go} />}
          </main>
        </div>
      </div>
      {notice && (
        <p className="fixed right-4 bottom-4 z-40 max-w-sm rounded-sm border border-line bg-raised px-4 py-3 text-sm">{notice}</p>
      )}
      {palette && (
        <div className="fixed inset-0 z-40 grid place-items-start bg-ink/70 px-4 pt-24" onClick={() => setPalette(false)}>
          <div className="w-full max-w-lg rounded-md border border-line bg-panel p-3" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Naar…"
              className="min-h-11 w-full bg-transparent px-2 text-ivory outline-none"
            />
            <ul className="mt-2">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button type="button" className="min-h-11 w-full rounded-sm px-2 text-left hover:bg-raised" onClick={() => go(item.id)}>
                    <span className="text-xs tracking-widest text-mist uppercase">{item.group}</span>
                    <span className="ml-2">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
