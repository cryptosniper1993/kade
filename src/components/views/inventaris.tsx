import { useState } from "react";
import { accountName } from "@/lib/accounts";
import { ASSET_CATEGORIES, assetAccount, daysUntil, defaultLife, depreciation, fleetSnapshot, leaseCostAccount } from "@/lib/assets";
import { brusselsToday, formatDay } from "@/lib/day";
import { bookAssetPurchase, bookDepreciation, deleteAsset, saveAsset, saveIncident, setIncidentStatus } from "@/lib/fleet";
import { euroLabel } from "@/lib/money";
import { personName, projectName } from "@/lib/briefing";
import type { Asset, AssetCategory, AssetKind, AssetStatus, Desk } from "@/lib/types";
import { Button, Field, Kicker, Panel, Select, TextInput, Area } from "@/components/ui";

const empty = {
  id: "",
  name: "",
  kind: "eigendom" as AssetKind,
  category: "hardware" as AssetCategory,
  ref: "",
  vendor: "",
  acquiredOn: "",
  endsOn: "",
  amount: "",
  residual: "",
  life: "36",
  status: "gebruik" as AssetStatus,
  holderId: "",
  projectId: "",
  note: "",
};

const statusLabel: Record<Asset["status"], string> = {
  gebruik: "In gebruik",
  reserve: "Reserve",
  defect: "Defect",
  einde: "Einde",
};

export function InventarisView({ desk, refresh, notice }: { desk: Desk; refresh: () => Promise<void>; notice: (m: string) => void }) {
  const today = brusselsToday();
  const snap = fleetSnapshot(desk.assets, today);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState("");
  const [failTitle, setFailTitle] = useState("");
  const [failDetail, setFailDetail] = useState("");
  const [failAsset, setFailAsset] = useState("");
  const [failProject, setFailProject] = useState("");
  const [failSeverity, setFailSeverity] = useState<"hoog" | "normaal">("hoog");
  const [failDate, setFailDate] = useState(today);
  const openFails = desk.incidents.filter((item) => item.status !== "gesloten");
  const closedFails = desk.incidents.filter((item) => item.status === "gesloten");
  const people = desk.people.filter((person) => person.active);
  const preview = depreciation(
    {
      id: "",
      name: form.name,
      kind: form.kind,
      category: form.category,
      ref: "",
      vendor: "",
      acquiredOn: form.acquiredOn || null,
      endsOn: form.endsOn || null,
      amountEur: Number(form.amount.replace(",", ".")) || 0,
      residualEur: Number(form.residual.replace(",", ".")) || 0,
      lifeMonths: Number(form.life) || 36,
      status: "gebruik",
      holderId: null,
      projectId: null,
      note: "",
    },
    today,
  );

  function set<K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function edit(asset: Asset) {
    setForm({
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      category: asset.category,
      ref: asset.ref,
      vendor: asset.vendor,
      acquiredOn: asset.acquiredOn ?? "",
      endsOn: asset.endsOn ?? "",
      amount: String(asset.amountEur || ""),
      residual: String(asset.residualEur || ""),
      life: String(asset.lifeMonths),
      status: asset.status,
      holderId: asset.holderId ?? "",
      projectId: asset.projectId ?? "",
      note: asset.note,
    });
  }

  async function save() {
    setBusy("save");
    try {
      await saveAsset({
        data: {
          id: form.id,
          name: form.name,
          kind: form.kind,
          category: form.category,
          ref: form.ref,
          vendor: form.vendor,
          acquiredOn: form.acquiredOn,
          endsOn: form.endsOn,
          amountEur: form.amount,
          residualEur: form.residual,
          lifeMonths: form.life,
          status: form.status,
          holderId: form.holderId,
          projectId: form.projectId,
          note: form.note,
        },
      });
      setForm(empty);
      await refresh();
      notice(form.id ? "Stuk bijgewerkt." : "Stuk op de inventaris.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "Bewaren lukte niet.");
    } finally {
      setBusy("");
    }
  }

  async function buy(id: string) {
    setBusy(id);
    try {
      const result = await bookAssetPurchase({ data: { id } });
      await refresh();
      notice(result.already ? "De aankoop stond al in de boeken." : result.vatSkipped ? "Aankoop geboekt, zonder btw. Op een wagen is die aftrek beperkt." : "Aankoop geboekt op de bank.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "De aankoop bleef liggen.");
    } finally {
      setBusy("");
    }
  }

  async function depreciate() {
    setBusy("dep");
    try {
      const result = await bookDepreciation();
      await refresh();
      notice(result.booked === 0 ? "Niets nieuws af te schrijven deze maand." : `${result.booked} afschrijving${result.booked === 1 ? "" : "en"} geboekt.`);
    } catch (error) {
      notice(error instanceof Error ? error.message : "Afschrijven lukte niet.");
    } finally {
      setBusy("");
    }
  }

  async function fail() {
    setBusy("fail");
    try {
      await saveIncident({
        data: {
          title: failTitle,
          detail: failDetail,
          assetId: failAsset,
          projectId: failProject,
          severity: failSeverity,
          happenedOn: failDate,
        },
      });
      setFailTitle("");
      setFailDetail("");
      await refresh();
      notice("Storing staat open. De opvolging ligt op de brug.");
    } catch (error) {
      notice(error instanceof Error ? error.message : "De storing bleef liggen.");
    } finally {
      setBusy("");
    }
  }

  async function move(id: string, status: "open" | "opvolging" | "gesloten") {
    setBusy(id);
    try {
      await setIncidentStatus({ data: { id, status } });
      await refresh();
    } catch (error) {
      notice(error instanceof Error ? error.message : "Status bleef staan.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <Kicker>Finance · Inventaris</Kicker>
        <h1 className="mt-2 font-display text-5xl">Wat de zaak heeft.</h1>
        <p className="mt-2 max-w-xl text-mist text-pretty">
          Eigendom staat op de balans en schrijf je lineair af, een begonnen maand telt mee. Een operationele lease blijft buiten de balans. De factuur daarvan boek je als kost, met het btw-percentage dat bij het contract hoort.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Eigendom" value={String(snap.owned)} hint={`Boekwaarde ${euroLabel(snap.book)}`} />
        <Tile label="Lease" value={String(snap.leased)} hint={`${euroLabel(snap.monthlyLease)} per maand`} />
        <Tile label="Loopt af" value={String(snap.ending.length)} hint="Binnen 90 dagen" />
        <Tile label="Storingen" value={String(openFails.length)} hint="Opvolging op de brug" />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Panel className="flex flex-col gap-3 xl:col-span-2">
          <Kicker>{form.id ? "Bijwerken" : "Nieuw stuk"}</Kicker>
          <Field label="Naam">
            <TextInput value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Leasewagen, laptop, licentie" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Soort">
              <Select value={form.kind} onChange={(e) => set("kind", e.target.value === "lease" ? "lease" : "eigendom")}>
                <option value="eigendom">Eigendom</option>
                <option value="lease">Lease</option>
              </Select>
            </Field>
            <Field label="Categorie">
              <Select
                value={form.category}
                onChange={(e) => {
                  const category = asCat(e.target.value);
                  setForm((prev) => ({ ...prev, category, life: String(defaultLife(category)) }));
                }}
              >
                {ASSET_CATEGORIES.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={form.kind === "lease" ? "Contract" : "Serienummer of plaat"}>
              <TextInput value={form.ref} onChange={(e) => set("ref", e.target.value)} />
            </Field>
            <Field label="Leverancier">
              <TextInput value={form.vendor} onChange={(e) => set("vendor", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={form.kind === "lease" ? "Start" : "Aankoop"}>
              <TextInput type="date" value={form.acquiredOn} onChange={(e) => set("acquiredOn", e.target.value)} />
            </Field>
            <Field label={form.kind === "lease" ? "Einde contract" : "Niet van toepassing"}>
              <TextInput type="date" value={form.endsOn} disabled={form.kind !== "lease"} onChange={(e) => set("endsOn", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={form.kind === "lease" ? "Maand excl. btw" : "Aanschaf excl. btw"}>
              <TextInput inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
            </Field>
            {form.kind === "eigendom" ? (
              <Field label="Restwaarde">
                <TextInput inputMode="decimal" value={form.residual} onChange={(e) => set("residual", e.target.value)} />
              </Field>
            ) : (
              <Field label="Kost boeken op">
                <TextInput value={accountName(leaseCostAccount(form.category))} readOnly />
              </Field>
            )}
          </div>
          {form.kind === "eigendom" && (
            <Field label="Afschrijving in maanden">
              <TextInput inputMode="numeric" value={form.life} onChange={(e) => set("life", e.target.value)} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bij wie">
              <Select value={form.holderId} onChange={(e) => set("holderId", e.target.value)}>
                <option value="">Niemand</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Project">
              <Select value={form.projectId} onChange={(e) => set("projectId", e.target.value)}>
                <option value="">Geen</option>
                {desk.projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Nota">
            <Area value={form.note} onChange={(e) => set("note", e.target.value)} />
          </Field>
          {form.kind === "eigendom" && (
            <p className="text-sm text-mist">
              {euroLabel(preview.monthly)} per maand. Boekwaarde nu {euroLabel(preview.book)}, op rekening {assetAccount(form.category)}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy === "save"} onClick={save}>{busy === "save" ? "Bewaren…" : form.id ? "Bijwerken" : "Op de inventaris"}</Button>
            {form.id && <Button variant="ghost" onClick={() => setForm(empty)}>Nieuw</Button>}
          </div>
        </Panel>

        <div className="flex flex-col gap-3 xl:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-3xl">Register</h2>
            <Button variant="ghost" disabled={busy === "dep"} onClick={depreciate}>
              {busy === "dep" ? "Boekt…" : "Afschrijvingen deze maand"}
            </Button>
          </div>
          <p className="text-sm text-mist">Alleen stukken waarvan de aankoop al in de boeken staat. Eén maand per keer, niet met terugwerkende kracht. De kaart toont wel de boekwaarde na alle verlopen maanden.</p>
          {desk.assets.length === 0 && <p className="text-sm text-mist">Nog niets. Een leasewagen of een laptop hoort hier, niet in een losse sheet.</p>}
          {desk.assets.map((asset) => {
            const dep = depreciation(asset, today);
            const left = asset.endsOn ? daysUntil(today, asset.endsOn) : null;
            return (
              <Panel key={asset.id} className={asset.status === "defect" ? "border-brass" : ""}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-xs tracking-widest text-brass uppercase">
                      {asset.kind === "lease" ? "Lease" : "Eigendom"} · {ASSET_CATEGORIES.find((item) => item.id === asset.category)?.label} · {statusLabel[asset.status]}
                    </p>
                    <h3 className="mt-1 font-display text-3xl">{asset.name}</h3>
                  </div>
                  <p className="font-display text-3xl tabular-nums">
                    {asset.kind === "lease" ? euroLabel(asset.amountEur) : euroLabel(dep.book)}
                  </p>
                </div>
                <p className="mt-2 text-sm text-mist">
                  {asset.kind === "lease"
                    ? `${euroLabel(asset.amountEur)} per maand, buiten balans. Kost op ${leaseCostAccount(asset.category)}.`
                    : `Aanschaf ${euroLabel(asset.amountEur)}. Afschrijving ${euroLabel(dep.monthly)}. Rekening ${assetAccount(asset.category)}.`}
                  {asset.ref && ` ${asset.ref}.`}
                  {asset.vendor && ` ${asset.vendor}.`}
                </p>
                <p className="mt-1 text-sm text-mist">
                  {personName(desk.people, asset.holderId)}
                  <span className="mx-1.5">·</span>
                  {projectName(desk.projects, asset.projectId)}
                  {left != null && (
                    <>
                      <span className="mx-1.5">·</span>
                      {left < 0 ? "contract voorbij" : left === 0 ? "loopt vandaag af" : `einde over ${left} dagen`}
                    </>
                  )}
                  {asset.acquiredOn && (
                    <>
                      <span className="mx-1.5">·</span>
                      sinds {formatDay(asset.acquiredOn)}
                    </>
                  )}
                </p>
                {asset.note && <p className="mt-2 text-sm text-pretty">{asset.note}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => edit(asset)}>Wijzig</Button>
                  {asset.kind === "eigendom" && asset.amountEur > 0 && (
                    <Button variant="ghost" disabled={busy === asset.id} onClick={() => buy(asset.id)}>Aankoop boeken</Button>
                  )}
                  {(["gebruik", "reserve", "defect", "einde"] as const).map((status) => (
                    <Button
                      key={status}
                      variant="ghost"
                      disabled={asset.status === status || busy === asset.id}
                      onClick={async () => {
                        setBusy(asset.id);
                        try {
                          await saveAsset({ data: { ...toInput(asset), status } });
                          await refresh();
                        } catch (error) {
                          notice(error instanceof Error ? error.message : "Status bleef staan.");
                        } finally {
                          setBusy("");
                        }
                      }}
                    >
                      {statusLabel[status]}
                    </Button>
                  ))}
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      setBusy(asset.id);
                      try {
                        await deleteAsset({ data: { id: asset.id } });
                        await refresh();
                      } catch (error) {
                        notice(error instanceof Error ? error.message : "Weghalen lukte niet.");
                      } finally {
                        setBusy("");
                      }
                    }}
                  >
                    Weg
                  </Button>
                </div>
              </Panel>
            );
          })}
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <header>
          <Kicker>Storingen</Kicker>
          <h2 className="mt-2 font-display text-4xl">Wat faalt, krijgt een naam.</h2>
          <p className="mt-2 max-w-xl text-sm text-mist text-pretty">
            Een oplossing of een stuk dat uitvalt, komt hier. Elke open storing maakt een CIP-opvolging. Die zie je op de brug, met deadline over zeven dagen. Sluiten haalt ze van de brug.
          </p>
        </header>
        <Panel className="grid gap-3 lg:grid-cols-2">
          <Field label="Wat faalde">
            <TextInput value={failTitle} onChange={(e) => setFailTitle(e.target.value)} placeholder="WMS-koppeling geeft timeouts" />
          </Field>
          <Field label="Wanneer">
            <TextInput type="date" value={failDate} onChange={(e) => setFailDate(e.target.value)} />
          </Field>
          <Field label="Stuk">
            <Select value={failAsset} onChange={(e) => setFailAsset(e.target.value)}>
              <option value="">Geen stuk</option>
              {desk.assets.map((asset) => (
                <option key={asset.id} value={asset.id}>{asset.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Project">
            <Select value={failProject} onChange={(e) => setFailProject(e.target.value)}>
              <option value="">Geen project</option>
              {desk.projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ernst">
            <Select value={failSeverity} onChange={(e) => setFailSeverity(e.target.value === "normaal" ? "normaal" : "hoog")}>
              <option value="hoog">Hoog</option>
              <option value="normaal">Normaal</option>
            </Select>
          </Field>
          <Field label="Wat er gebeurde">
            <TextInput value={failDetail} onChange={(e) => setFailDetail(e.target.value)} placeholder="Sinds de release van dinsdag, bij orderbevestiging" />
          </Field>
          <div className="lg:col-span-2">
            <Button disabled={busy === "fail"} onClick={fail}>{busy === "fail" ? "Noteren…" : "Storing openen"}</Button>
          </div>
        </Panel>
        {openFails.length === 0 && <p className="text-sm text-mist">Geen open storing. Dat is geen reden om er geen te noteren als er een is.</p>}
        <ul className="flex flex-col gap-3">
          {openFails.map((item) => (
            <li key={item.id}>
              <Panel>
                <p className="text-xs tracking-widest text-brass uppercase">{item.severity} · {item.status === "opvolging" ? "In opvolging" : "Open"}</p>
                <h3 className="mt-1 font-display text-3xl">{item.title}</h3>
                <p className="mt-2 text-sm text-mist">
                  {item.happenedOn ? formatDay(item.happenedOn) : "Geen datum"}
                  <span className="mx-1.5">·</span>
                  {desk.assets.find((asset) => asset.id === item.assetId)?.name ?? "Geen stuk"}
                  <span className="mx-1.5">·</span>
                  {projectName(desk.projects, item.projectId)}
                </p>
                {item.detail && <p className="mt-2 text-sm text-pretty">{item.detail}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="ghost" disabled={busy === item.id || item.status === "opvolging"} onClick={() => move(item.id, "opvolging")}>In opvolging</Button>
                  <Button variant="ghost" disabled={busy === item.id} onClick={() => move(item.id, "gesloten")}>Sluiten</Button>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
        {closedFails.length > 0 && (
          <details className="text-sm text-mist">
            <summary className="min-h-11 cursor-pointer">Gesloten, {closedFails.length}</summary>
            <ul className="mt-2 flex flex-col gap-2">
              {closedFails.map((item) => (
                <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>{item.title}</span>
                  <button type="button" className="min-h-11 text-ivory" onClick={() => move(item.id, "open")}>Heropen</button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border border-line bg-raised px-4 py-4">
      <p className="text-xs tracking-widest text-mist uppercase">{label}</p>
      <p className="mt-1 font-display text-4xl tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-mist">{hint}</p>
    </div>
  );
}

function asCat(value: string): AssetCategory {
  if (value === "wagen" || value === "software" || value === "kantoor" || value === "overig") return value;
  return "hardware";
}

function toInput(asset: Asset) {
  return {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    category: asset.category,
    ref: asset.ref,
    vendor: asset.vendor,
    acquiredOn: asset.acquiredOn ?? "",
    endsOn: asset.endsOn ?? "",
    amountEur: asset.amountEur,
    residualEur: asset.residualEur,
    lifeMonths: asset.lifeMonths,
    holderId: asset.holderId ?? "",
    projectId: asset.projectId ?? "",
    note: asset.note,
  };
}
