export type LegalForm = "bv" | "eenmanszaak" | "vof" | "commv";
export type VatRegime = "quarterly" | "monthly" | "exempt";
/** Sociaal statuut van de zelfstandige: hoofdberoep of bijberoep. */
export type ActivityStatus = "hoofdberoep" | "bijberoep";

export type Company = {
  name: string;
  /** Leeg tot de gebruiker bij de onboarding een rechtsvorm kiest. */
  legalForm: LegalForm | "";
  vatNumber: string;
  enterpriseNumber: string;
  address: string;
  city: string;
  email: string;
  iban: string;
  vatRegime: VatRegime;
  activityStatus: ActivityStatus;
  yearEndMonth: number;
  /** Eigen omzetdrempel voor de vrijstellingsregeling; null = wettelijke drempel van het jaar. */
  exemptThreshold?: number | null;
};

export type Party = {
  id: string;
  name: string;
  vatNumber: string;
  email: string;
  phone: string;
  contact: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  payDays: number;
  iban: string;
  note: string;
  active: boolean;
  demo: boolean;
  /** Peppol-ID, bv. 0208:0123456789. Leeg = afgeleid van het btw-nummer. */
  peppolId: string;
};

export type Client = Party;

export type Supplier = Party & { account: string };

export type InvoiceLine = {
  description: string;
  qty: number;
  unitExVat: number;
  vatRate: number;
};

export type Invoice = {
  id: string;
  number: string;
  clientId: string | null;
  clientName: string;
  clientVat: string;
  clientAddress: string;
  issueDate: string;
  dueDate: string;
  status: "draft" | "sent" | "paid";
  notes: string;
  lines: InvoiceLine[];
  demo: boolean;
  peppolStatus: PeppolStatus;
  peppolMessage: string;
  kind?: "invoice" | "credit";
  creditOf?: string | null;
  vatTreatment?: "standard" | "verlegd" | "ic_levering" | "ic_dienst";
  b2c?: boolean;
  ogm?: string;
  peppolSkipped?: string;
};

export type PeppolStatus = "concept" | "verzonden" | "fout";

export type JournalLine = {
  id: string;
  account: string;
  label: string;
  debit: number;
  credit: number;
};

export type Journal = {
  id: string;
  bookedOn: string;
  memo: string;
  source: string;
  ref: string;
  demo: boolean;
  supplierId: string | null;
  lines: JournalLine[];
};

export type DocMeta = {
  id: string;
  filename: string;
  mime: string;
  kind: string;
  vendor: string;
  docDate: string | null;
  amountEur: number | null;
  note: string;
  demo: boolean;
  createdAt: string;
  clientId: string | null;
  supplierId: string | null;
};

export type Bot = {
  id: string;
  name: string;
  role: string;
  brief: string;
  followed: boolean;
  status: string;
  task: string;
  lastResult: string;
};

export type ResearchItem = {
  id: string;
  title: string;
  question: string;
  answer: string;
  createdAt: string;
};

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type BotRun = {
  id: string;
  botName: string;
  task: string;
  result: string;
  createdAt: string;
};

export type Person = {
  id: string;
  name: string;
  role: string;
  active: boolean;
};

export type ProjectStatus = "actief" | "pauze" | "klaar";

export type Project = {
  id: string;
  name: string;
  clientName: string;
  status: ProjectStatus;
  note: string;
  dueOn: string | null;
  createdAt: string;
  /** JustAMinute-velden (dossier §7). */
  botId: string;
  confidential: boolean;
  phase: string;
  contacts: string;
  nextAction: string;
};

export type TaskKind = "todo" | "cip";
export type TaskPriority = "hoog" | "normaal" | "laag";
export type TaskStatus = "open" | "bezig" | "klaar";

export type Task = {
  id: string;
  projectId: string | null;
  assigneeId: string | null;
  title: string;
  detail: string;
  kind: TaskKind;
  cause: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueOn: string | null;
  createdAt: string;
  doneAt: string | null;
};

export type AssetKind = "eigendom" | "lease";
export type AssetCategory = "wagen" | "hardware" | "software" | "kantoor" | "overig";
export type AssetStatus = "gebruik" | "reserve" | "defect" | "einde";

export type Asset = {
  id: string;
  name: string;
  kind: AssetKind;
  category: AssetCategory;
  ref: string;
  vendor: string;
  acquiredOn: string | null;
  endsOn: string | null;
  amountEur: number;
  residualEur: number;
  lifeMonths: number;
  status: AssetStatus;
  holderId: string | null;
  projectId: string | null;
  note: string;
};

export type IncidentStatus = "open" | "opvolging" | "gesloten";

export type Incident = {
  id: string;
  assetId: string | null;
  projectId: string | null;
  taskId: string | null;
  title: string;
  detail: string;
  severity: "hoog" | "normaal";
  status: IncidentStatus;
  happenedOn: string | null;
  createdAt: string;
};

export type BriefingNote = {
  day: string;
  body: string;
};

export type VoiceSettings = {
  agentName: string;
  voiceUri: string;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  autoSpeak: boolean;
  sendOnListen: boolean;
};

export type Desk = {
  company: Company | null;
  clients: Client[];
  suppliers: Supplier[];
  invoices: Invoice[];
  journals: Journal[];
  documents: DocMeta[];
  bots: Bot[];
  researches: ResearchItem[];
  messages: AgentMessage[];
  fiscal: AgentMessage[];
  hoofd: AgentMessage[];
  runs: BotRun[];
  brand: string;
  theme: "kade" | "justaminute";
  voice: VoiceSettings;
  people: Person[];
  projects: Project[];
  tasks: Task[];
  assets: Asset[];
  incidents: Incident[];
  briefing: BriefingNote | null;
};

