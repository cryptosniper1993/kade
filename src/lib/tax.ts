import { isCompanyForm, type Snapshot } from "./finance";
import type { Company, Invoice } from "./types";

export type Tip = { id: string; tone: "act" | "watch" | "ok"; title: string; body: string };

export type Duty = {
  id: string;
  title: string;
  detail: string;
  date: string;
  days: number;
};

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(today: Date, date: string): number {
  const a = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = date.split("-").map(Number);
  const b = Date.UTC(y, m - 1, d);
  return Math.round((b - a) / 86_400_000);
}

function weekendNote(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (day === 0 || day === 6) return " Die datum valt in het weekend. Intervat schuift vaak naar de eerstvolgende werkdag. Kijk na.";
  return "";
}

export function duties(company: Company | null, today = new Date()): Duty[] {
  const form = company?.legalForm ?? "bv";
  const regime = company?.vatRegime ?? "quarterly";
  const yearEnd = company?.yearEndMonth ?? 12;
  const y = today.getFullYear();
  const items: { id: string; title: string; detail: string; date: string }[] = [];

  if (regime !== "exempt") {
    if (regime === "monthly") {
      const thisMonth = new Date(y, today.getMonth(), 20);
      const next = today.getDate() <= 20 ? thisMonth : new Date(y, today.getMonth() + 1, 20);
      const period = new Date(next.getFullYear(), next.getMonth() - 1, 1);
      const label = period.toLocaleDateString("nl-BE", { month: "long", year: "numeric" });
      items.push({
        id: "vat-m",
        title: "Btw-aangifte",
        detail: `Maandaangifte voor ${label}. Uiterlijk de 20e, ook als alles nul is.${weekendNote(iso(next))}`,
        date: iso(next),
      });
    } else {
      const candidates = [
        { date: new Date(y, 0, 25), period: `Q4 ${y - 1}` },
        { date: new Date(y, 3, 25), period: `Q1 ${y}` },
        { date: new Date(y, 6, 25), period: `Q2 ${y}` },
        { date: new Date(y, 9, 25), period: `Q3 ${y}` },
        { date: new Date(y + 1, 0, 25), period: `Q4 ${y}` },
      ];
      const pick = candidates.find((c) => daysBetween(today, iso(c.date)) >= -12) ?? candidates[candidates.length - 1];
      items.push({
        id: "vat-q",
        title: `Btw-aangifte ${pick.period}`,
        detail: `Kwartaalaangifte via Intervat, uiterlijk de 25e. Een maand zonder facturen is nog altijd een nihil-aangifte.${weekendNote(iso(pick.date))}`,
        date: iso(pick.date),
      });
    }
  } else {
    items.push({
      id: "vat-exempt",
      title: "Btw-vrijstelling",
      detail: "Onder de drempel van 25.000 euro omzet reken je geen btw aan en doe je geen periodieke aangifte. Je verliest wel de aftrek. De jaarlijkse listing blijft.",
      date: iso(new Date(y, today.getMonth(), today.getDate())),
    });
  }

  const listingYear = today.getMonth() > 2 || (today.getMonth() === 2 && today.getDate() > 31) ? y + 1 : y;
  items.push({
    id: "listing",
    title: "Klantenlisting",
    detail: "Jaarlijkse opgave via Intervat, ook een nihil-listing als er geen Belgische btw-plichtige klanten waren. Drempel van de vrijstellingsregeling: 25.000 euro omzet.",
    date: iso(new Date(listingYear, 2, 31)),
  });

  const prepay = [
    { id: "va1", title: "Voorafbetaling VA1", date: new Date(y, 3, 10) },
    { id: "va2", title: "Voorafbetaling VA2", date: new Date(y, 6, 10) },
    { id: "va3", title: "Voorafbetaling VA3", date: new Date(y, 9, 10) },
    { id: "va4", title: "Voorafbetaling VA4", date: new Date(y, 11, 20) },
  ];
  for (const slot of prepay) {
    const date = iso(slot.date);
    if (daysBetween(today, date) >= -20) {
      items.push({
        id: slot.id,
        title: slot.title,
        detail: "Zonder voorafbetalingen rekent de fiscus een vermeerdering. VA4 is de laatste kans van het jaar, op 20 december.",
        date,
      });
    }
  }

  if (isCompanyForm(form)) {
    items.push({
      id: "contrib",
      title: "Vennootschapsbijdrage",
      detail: "In 2026 is dat 409,30 euro als het balanstotaal van het voorlaatste boekjaar onder 879.163,44 euro zat, anders 1.022,38 euro. Starters kunnen onder voorwaarden de eerste jaren vrijstelling krijgen. Betaal vóór 31 december, tenzij je na 30 september oprichtte.",
      date: iso(new Date(y, 11, 31)),
    });
    const endYear = today.getMonth() + 1 > yearEnd ? y + 1 : y;
    const endDay = new Date(endYear, yearEnd, 0).getDate();
    const close = new Date(endYear, yearEnd - 1, endDay);
    const av = new Date(close.getFullYear(), close.getMonth() + 6, close.getDate());
    const nbb = new Date(close.getFullYear(), close.getMonth() + 7, close.getDate());
    items.push({
      id: "av",
      title: "Algemene vergadering",
      detail: "De jaarrekening moet binnen zes maanden na de afsluiting goedgekeurd worden. Kleine vennootschappen hoeven geen commissaris en geen formeel bestuursverslag.",
      date: iso(av),
    });
    items.push({
      id: "nbb",
      title: "Neerlegging NBB",
      detail: "Binnen zeven maanden na de afsluiting bij de Balanscentrale. Boekjaar tot 31 december betekent uiterlijk 31 juli. Micro-XBRL kost in 2026 67 euro, het verkorte schema 89,40 euro. Te laat indienen wordt duurder vanaf de negende maand.",
      date: iso(nbb),
    });
    items.push({
      id: "venb",
      title: "Aangifte vennootschapsbelasting",
      detail: "Via Biztax. Het tarief is 25%, of 20% op de eerste 100.000 euro winst voor een kleine vennootschap met minstens 50.000 euro bestuurdersbezoldiging in 2026. De belastbare winst is het boekhoudresultaat na fiscale correcties, niet de kassa.",
      date: iso(nbb),
    });
  } else {
    items.push({
      id: "pb",
      title: "Personenbelasting",
      detail: "Een eenmanszaak dient een aangifte personenbelasting in, geen vennootschapsbelasting. Sociale bijdragen lopen via je sociaal verzekeringsfonds, op basis van je beroepsinkomen." +
        (company?.activityStatus === "hoofdberoep"
          ? " In hoofdberoep geldt een minimumbijdrage, ook bij lage inkomsten."
          : " In bijberoep gelden andere regels: onder een inkomensdrempel betaal je weinig of geen sociale bijdragen. Vraag de actuele drempel na bij je sociaal verzekeringsfonds."),
      date: iso(new Date(y + (today.getMonth() > 5 ? 1 : 0), 5, 30)),
    });
  }

  return items
    .map((item) => ({ ...item, days: daysBetween(today, item.date) }))
    .filter((item) => item.days >= -18)
    .sort((a, b) => a.days - b.days)
    .slice(0, 6);
}

function overdue(invoices: Invoice[], today: Date): Invoice[] {
  const todayIso = iso(today);
  return invoices.filter((i) => i.status === "sent" && i.dueDate < todayIso);
}

export function dailyTips(snapshot: Snapshot, company: Company | null, invoices: Invoice[], today = new Date()): Tip[] {
  const tips: Tip[] = [];
  const late = overdue(invoices, today);
  if (late.length) {
    tips.push({
      id: "late",
      tone: "act",
      title: late.length === 1 ? "Eén factuur is te laat" : `${late.length} facturen zijn te laat`,
      body: `${late.map((i) => i.number).join(", ")} staan nog open voorbij de vervaldag. Cash die niet binnen is, betaalt ook geen leveranciers. Laat de debiteurenbot een aanmaning schrijven, of bel zelf. Een herinnering is geen boeking.`,
    });
  }

  const soonVat = duties(company, today).find((d) => d.id.startsWith("vat") && d.days <= 14 && d.days >= -5);
  if (soonVat && company?.vatRegime !== "exempt") {
    tips.push({
      id: "vat-soon",
      tone: soonVat.days < 0 ? "act" : "watch",
      title: soonVat.days < 0 ? "Btw-deadline net voorbij" : "Btw-deadline in zicht",
      body: `${soonVat.title}: ${soonVat.detail} Netto positie in de boeken: ${snapshot.vatNet.toFixed(2)} euro ${snapshot.vatNet >= 0 ? "te storten" : "te ontvangen"}. Dat is een hulplijn, geen aangifte.`,
    });
  }

  const month = today.getMonth() + 1;
  const companyForm = isCompanyForm(company?.legalForm);
  if (companyForm && snapshot.profit > 8000 && snapshot.directorPay < 50000) {
    tips.push({
      id: "pay",
      tone: "watch",
      title: "Bezoldiging onder de lat van 2026",
      body: `Er is ${snapshot.directorPay.toFixed(0)} euro bezoldiging geboekt. Voor het verlaagd tarief van 20% op de eerste 100.000 euro winst moet minstens één bestuurder, een natuurlijk persoon, minstens 50.000 euro bruto krijgen. Daaronder betaal je 25% op alles. Een loon optrekken kost ook sociale bijdragen. Reken beide, niet alleen de vennootschapsbelasting.`,
    });
  }

  if (snapshot.profit > 12000 && month >= 10) {
    tips.push({
      id: "spend",
      tone: "watch",
      title: "Winst genoeg om het jaareinde nuchter te bekijken",
      body: companyForm
        ? "Echte beroepskosten die je in dit boekjaar toch maakt (licenties, hardware, opleiding, een onderaannemer) horen vóór de afsluiting in de boeken, niet in januari. Dat verlaagt de grondslag. Een factuur verzinnen of een privé-uitgave vermommen is geen tip, dat is een probleem met de fiscus. Restaurant blijft beperkt aftrekbaar, autokosten ook."
        : "Zelfde regel in een eenmanszaak: echte beroepskosten van dit jaar verlagen je personenbelasting en vaak ook de sociale bijdragen. Enkel kosten die bij de zaak horen. Niet je vakantie.",
    });
  }

  if (companyForm && snapshot.profit > 100000) {
    tips.push({
      id: "cliff",
      tone: "watch",
      title: "Je zit voorbij de schijf van 100.000",
      body: "Boven 100.000 euro winst geldt 25%, ook als het verlaagd tarief op de eerste schijf speelt. Het maximale voordeel van die 20% is ongeveer 5.000 euro. Meer omzet is nog altijd meer winst. Laat je niet tot rare constructies praten door een afgerond getal.",
    });
  }

  if (snapshot.profit > 5000 && snapshot.prepayments < snapshot.estimatedTax * 0.4 && month >= 6 && companyForm) {
    tips.push({
      id: "prepay",
      tone: "act",
      title: "Voorafbetalingen lopen achter op de winst",
      body: `Geschatte vennootschapsbelasting, ruw: ${snapshot.estimatedTax.toFixed(0)} euro. Geboekte voorafbetalingen: ${snapshot.prepayments.toFixed(0)} euro. De vermeerdering bij geen of te late voorafbetaling is reëel. VA1 10 april, VA2 10 juli, VA3 10 oktober, VA4 20 december.`,
    });
  }

  if (company?.vatRegime === "exempt" && snapshot.income > 18000) {
    tips.push({
      id: "threshold",
      tone: "act",
      title: "De vrijstellingsdrempel komt in zicht",
      body: "25.000 euro omzet exclusief btw is de grens van de kleine-ondernemersregeling. Erop overgaan betekent btw aanrekenen én aftrekken. Dat is vaak gunstig zodra je zelf btw betaalt op kosten. Onder de drempel blijven is een keuze, geen automatisme.",
    });
  }

  if (snapshot.cash < 0) {
    tips.push({
      id: "cash",
      tone: "act",
      title: "De bankrekening staat onder nul in de boeken",
      body: "Of er ontbreekt een inbreng, of er zijn kosten geboekt die de kas niet dekt. Kijk de rekening 5500 na voor je offertes belooft die je niet kunt voorfinancieren.",
    });
  }

  if (!tips.length) {
    tips.push({
      id: "calm",
      tone: "ok",
      title: "Geen brand op de brug",
      body: "De cijfers schreeuwen niks. Bewaar bonnen en facturen tien jaar voor de fiscus, zeven jaar voor het boekhoudrecht. En dien een nihil-aangifte toch in. Stilte is geen vrijstelling.",
    });
  }

  return tips.slice(0, 3);
}

export const TAX_GUIDE: { title: string; body: string }[] = [
  {
    title: "Wat een BV minstens moet bijhouden",
    body: "Elke BV voert een dubbele boekhouding: dagboek, grootboek, inventaris. Er zijn drie maten. Micro: niet meer dan één van 10 VTE, 900.000 euro omzet, 450.000 euro balanstotaal. Klein: niet meer dan één van 50 VTE, 11,25 miljoen omzet, 6 miljoen balanstotaal. Die drempels gelden voor boekjaren vanaf 2024. Micro en klein leggen een korter schema neer en hebben geen commissaris nodig.",
  },
  {
    title: "Jaarrekening en neerlegging",
    body: "De algemene vergadering keurt de jaarrekening goed binnen zes maanden na de afsluiting. Neerlegging bij de Balanscentrale van de NBB volgt binnen zeven maanden, dus 31 juli als je op 31 december afsluit. In 2026 kost XBRL ongeveer 67 euro voor het microschema, 89,40 euro voor het verkorte schema en 379,50 euro voor het volledige schema. Te laat wordt duurder: voor een kleine BV 151 euro vanaf de negende maand, 227 euro in de tiende tot twaalfde, 453 euro daarna.",
  },
  {
    title: "Vennootschapsbelasting 2026",
    body: "Het gewone tarief is 25%. Kleine vennootschappen betalen 20% op de eerste 100.000 euro winst en 25% daarboven, als aan de voorwaarden voldaan is. De bekendste: minstens één bestuurder-natuurlijk persoon krijgt minstens 50.000 euro bruto bezoldiging. Dat was 45.000 euro. Het maximale voordeel van de schijf is 5.000 euro. De belastbare winst vertrekt van het boekhoudresultaat en wordt daarna gecorrigeerd. KADE maakt die aangifte niet.",
  },
  {
    title: "Voorafbetalingen en vennootschapsbijdrage",
    body: "Data 2026: 10 april, 10 juli, 10 oktober en 20 december. Wie niets vooraf betaalt, krijgt een belastingvermeerdering. De vennootschapsbijdrage 2026 is 409,30 euro onder een balanstotaal van 879.163,44 euro in het referentiejaar, en 1.022,38 euro erboven. Uiterlijk 31 december, behalve bij oprichting na 30 september. Een starter kan de eerste drie jaar onder voorwaarden vrijgesteld zijn.",
  },
  {
    title: "Btw",
    body: "IT-diensten in België zijn in de regel 21%. Kwartaalindieners dienen in tegen de 25e van de volgende maand, maandindieners tegen de 20e. Geen omzet is geen vrijstelling van aangifte: nihil blijft verplicht zolang je niet in de vrijstellingsregeling zit. Die regeling kan tot 25.000 euro jaaromzet. Je rekent dan geen btw aan, dient geen periodieke aangifte in, en trekt ook geen btw af. De klantenlisting volgt op 31 maart, ook als ze leeg is. Bewaar btw-stukken tien jaar.",
  },
  {
    title: "Eenmanszaak",
    body: "Geen vennootschapsbelasting en geen neerlegging zoals een BV. Wel personenbelasting, sociale bijdragen als zelfstandige, en dezelfde btw-regels. Een vereenvoudigde boekhouding kan bij een natuurlijke persoon onder bepaalde omzetgrenzen. Zodra je een vennootschap opricht, geldt de dubbele boekhouding.",
  },
  {
    title: "Kosten naar voren halen",
    body: "Een kost verlaagt de winst alleen als ze echt, beroepsmatig en van dit boekjaar is. Software, hardware, opleiding en onderaanneming die je toch nog dit jaar verbruikt, boek je beter vóór de afsluiting. Maaltijden in een vennootschap zijn klassiek beperkt tot 69%. Representatie is vaak niet aftrekbaar. Autokosten hangen af van CO2 en brandstof. KADE boekt het bedrag dat jij ingeeft. De fiscale correctie op de aangifte is werk voor je boekhouder, of voor Biztax met open ogen.",
  },
];
