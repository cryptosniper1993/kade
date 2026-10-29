# Finance

Finance bevat: **Klanten, Leveranciers, Offertes, Facturen, Inkomend, Boeken, Balans, Inventaris, Analyse, Schaar, Archief.** Bedragen zijn in euro; is de zaak vrijgesteld (art. 56bis, zie Beheer → Zaak) dan rekent Kade geen btw.

---

## Klanten en Leveranciers

**Doel:** het relatiebestand. Een klantfiche vult je facturen en offertes; een leveranciersfiche bepaalt op welke kostenrekening kosten komen.

### Stap voor stap

1. **Nieuw** → vul de fiche in → **Bewaren**.
2. Zoek met het zoekveld (naam, plaats of btw).
3. Klik een relatie om ze te openen. Bij een klant: **Factuur** opent een nieuwe factuur met die klant ingevuld.
4. **Peppol-ontvanger?** controleert of het ingevulde Peppol-ID op Peppol ontvangt (vereist een provider, zie [peppol-provider.md](peppol-provider.md)).
5. Bij een leverancier: boek een kost onder **Kosten**; hang bestanden onder **Stukken**.

### Alle velden en knoppen

| Veld | Uitleg |
| --- | --- |
| Naam | verplicht |
| Btw-nummer | bv. `BE0123456789` |
| Peppol-ID | bv. `0208:0123456789`; leeg = Kade leidt het af uit het btw-nummer bij verzenden |
| Contact, E-mail, Telefoon | |
| Betalingstermijn, dagen | vervaldag van facturen |
| Adres, Postcode, Plaats, Land | |
| IBAN | |
| Kostenrekening | (leveranciers) standaard kostenrekening, ook gebruikt bij Inkomend |
| Nota | |
| Actief (vinkje) | non-actieve relaties verdwijnen uit keuzelijsten |

Knoppen: **Nieuw**, **Bewaren**, **Sluiten**, **Peppol-ontvanger?**, **Factuur** (klant), **Wijzig**, **Actief/Non-actief**, **Weg**.

Detail van een relatie: **Facturen** (nummer, status betaald/open/concept), **Kosten** (leverancier: **Bedrag excl.**, **Datum**, vinkje betaald van de bank, **Kost boeken** — zonder vinkje komt de kost als schuld), **Stukken** (soort **Bon / Aankoopfactuur / Contract / Ander**, **Opladen**, max. 700 KB).

---

## Offertes

**Doel:** eerst akkoord, dan werk. Een goedgekeurde offerte zet je na het werk om in een conceptfactuur.

### Stap voor stap

1. Kies **Bestaande klant** (of **Nieuwe klant** en vul de klant in).
2. Vul **Datum**, **Geldig tot** (standaard +30 dagen), optioneel **Project**, de lijnen en **Nota**.
3. **Offerte bewaren** → nummer `OF-JJJJ-NNN`, status *concept*.
4. Zet de status: **Verstuurd**, **Goedgekeurd** of **Afgewezen**.
5. Na het werk: **Werk gedaan → omzetten naar factuur**. Kade maakt een conceptfactuur met dezelfde klant en lijnen en opent Facturen. Een offerte kan maar één keer omgezet worden (status *gefactureerd*).

### Alle opties

| Veld | Opties |
| --- | --- |
| Bestaande klant | **Nieuwe klant** of een actieve klant |
| Klant, Btw klant, Adres | vrij (ingevuld vanuit de klant) |
| Datum, Geldig tot | datum |
| Project (optioneel) | **Geen project** of een project |
| Lijn: Omschrijving, Aantal, Prijs excl., Btw | btw **21% / 6% / 0%** (niet zichtbaar bij vrijstelling) |
| Nota | |

Knoppen: **Lijn**, **Offerte bewaren**, **Nieuw**; per offerte **Open**, **Verstuurd**, **Goedgekeurd**, **Afgewezen**, **Weg** (alleen concept), **Werk gedaan → omzetten naar factuur** (alleen goedgekeurd), **Naar factuur**.
Statussen: concept, verstuurd, goedgekeurd, afgewezen, gefactureerd.

---

## Facturen (verkoop)

**Doel:** verkoopfacturen maken, boeken als vordering, versturen via Peppol en betalingen boeken.

### Stap voor stap

1. Kies **Bestaande klant** (of **Nieuwe klant**), vul **Klant**, **Btw klant**, **Adres**, **Datum**, **Vervaldag**, lijnen en **Nota**.
2. Kies:
   - **Concept** – bewaren zonder boeken;
   - **Enkel boeken** – definitief nummer (`K-JJJJ-NNN`), geboekt als vordering;
   - **Factuur OK en stuur uit** – boeken én meteen via Peppol versturen. Heeft de klant geen Peppol-ID, dan wordt de factuur wel geboekt en vraagt Kade de UBL te downloaden en anders te bezorgen.
3. In de lijst: **Betaald** boekt de betaling op de bank; **UBL** downloadt de Peppol-XML; **Verstuur via Peppol** voor een geboekte, nog niet verstuurde factuur.

### Alle opties

| Veld | Opties |
| --- | --- |
| Bestaande klant | **Nieuwe klant** of een klant |
| Klant, Btw klant, Adres, Datum, Vervaldag, Nota | |
| Lijn: Omschrijving, Aantal, Prijs excl., Btw | **21% / 6% / 0%** |

Knoppen: **Lijn**, **Concept**, **Enkel boeken**, **Factuur OK en stuur uit**; per factuur **Open** en **Weg** (concept), **Betaald** (open), **UBL** (geboekt), **Verstuur via Peppol**.
Status in de lijst: concept / open / betaald, en *niet via Peppol* / *verzonden via Peppol* / *Peppol-fout* (fout als tooltip).

---

## Inkomend (inkomende facturen / aankoopfacturen)

**Doel:** facturen die jij moet betalen, binnengekomen via Peppol of als UBL-bestand. Goedkeuren, boeken als kost met btw-aftrek, en betaald markeren.

### Stap voor stap

1. **Ophalen via Peppol** haalt nieuwe documenten uit de inbox van je provider (zie [peppol-provider.md](peppol-provider.md)), of **UBL XML opladen** voor een bestand (meerdere tegelijk mag). Facturen én creditnota's worden gelezen; een ingebedde PDF wordt bewaard.
2. Dubbels worden herkend op leverancier + factuurnummer ("stond er al").
3. Klik een factuur: je ziet leverancier, btw-nummer, Peppol-ID, adres, datum, vervaldatum, IBAN, mededeling, lijnen, btw per tarief en totalen.
4. Koppel indien nodig de **Leverancier in Kade** (Kade probeert dat zelf op btw-nummer of naam).
5. **Goedkeuren** of **Betwisten**.
6. Kies de **Kostenrekening** (standaard die van de leverancier, anders 6400) en druk **Boeken als kost**. Kade boekt kost + aftrekbare btw (4110) tegenover leverancier (4400); bij vrijstelling gaat de btw mee in de kost. Een creditnota boekt omgekeerd. De boeking telt mee in Boeken, Balans, Analyse en de btw-cijfers.
7. Bij betaling: vul **Betaald op** en druk **Markeer betaald**. Is de factuur geboekt, dan boekt Kade ook de betaling (4400 aan 5500 bank).

### Alle opties

| Plaats | Veld / knop | Uitleg |
| --- | --- | --- |
| Bovenaan | **Ophalen via Peppol** | inbox van de provider ophalen |
| | **UBL XML opladen** | `.xml`, meerdere bestanden |
| | Open te betalen | som van nieuw + goedgekeurd |
| Filter | **Alle, Nieuw, Goedgekeurd, Betaald, Betwist** | met aantallen |
| Detail | Leverancier in Kade | **Niet gekoppeld** of een leverancier |
| | **PDF** | alleen als er een PDF in de UBL zat |
| | **UBL XML** | origineel bestand downloaden |
| | **Goedkeuren**, **Betwisten**, **Terug naar nieuw** | status |
| | **Verwijderen** | alleen als nog niet geboekt |
| | Kostenrekening + **Boeken als kost** | één keer per factuur; niet bij betwist |
| | Betaald op + **Markeer betaald** | niet bij betwist |

Statussen: **nieuw**, **goedgekeurd**, **betaald**, **betwist**. Betaald is eindstatus.

---

## Boeken

**Doel:** dubbel boekhouden. Facturen boeken zichzelf; hier boek je kosten, materiaal, bezoldiging, voorafbetalingen en inbreng.

### Stap voor stap

1. Kies **Soort**, **Datum**, **Omschrijving**, **Rekening**, bedrag en **Btw**.
2. Bij een kost: vink **Meteen betaald via de bank** aan of niet (dan schuld aan leverancier).
3. **Boeken**. Het **Journaal** toont de laatste 40 boekingen; manuele boekingen kan je verwijderen (factuurboekingen niet).
4. Onder **Belgische plichten, 2026** staat een samenvatting van de regels (geen advies op maat).

| Veld | Opties |
| --- | --- |
| Soort | **Kost**, **Informaticamateriaal**, **Bezoldiging**, **Voorafbetaling VenB**, **Inbreng op de bank** |
| Rekening | kostenrekeningen 6100 Huur en lease, 6110 Software en cloud, 6120 Hardware, 6130 Telecom, 6140 Marketing, 6150 Verplaatsingen, 6160 Kantoor, 6170 Onderaanneming, 6180 Opleiding, 6200 Bezoldigingen, 6300 Afschrijvingen, 6400 Diverse kosten |
| Btw | **21% / 12% / 6% / 0%** |
| Meteen betaald via de bank | vinkje (alleen bij Kost) |

---

## Balans

**Doel:** de balans afsluiten. Toont **Activa** en **Passiva + resultaat** per rekening, het **Verschil** (moet 0 zijn, anders "Verschil, nakijken") en een blok **Vereenvoudigde belasting**. Alleen lezen.

## Analyse

**Doel:** waar het geld loopt in dit boekjaar: **Omzet** en **Kosten** per maand, **Kosten per rekening** en **Klanten, excl. btw**. Alleen lezen.

## Inventaris

**Doel:** wat de zaak heeft (eigendom of lease), afschrijvingen en storingen.

### Stap voor stap

1. Vul een nieuw stuk in en druk **Op de inventaris** (bij bewerken **Bijwerken**; **Nieuw** maakt het formulier leeg).
2. Eigendom met bedrag: **Aankoop boeken** boekt de aankoop op de bank (op een wagen zonder btw-aftrek).
3. **Afschrijvingen deze maand** boekt de maandelijkse afschrijving van alle stukken.
4. Per stuk: **Wijzig**, status **In gebruik / Reserve / Defect / Einde**, **Weg**.
5. **Storingen**: vul in en druk **Storing openen**; daarna **In opvolging**, **Sluiten** of **Heropen**.

| Veld | Opties |
| --- | --- |
| Naam | bv. leasewagen, laptop, licentie |
| Soort | **Eigendom**, **Lease** |
| Categorie | **Wagen**, **Hardware**, **Software**, **Kantoor**, **Overig** |
| Serienummer of plaat / Contract | |
| Leverancier | |
| Aankoop / Start, Einde contract (lease) | datum |
| Aanschaf excl. btw / Maand excl. btw | bedrag |
| Restwaarde, Kost boeken op, Afschrijving in maanden | |
| Bij wie | **Niemand** of een persoon |
| Project | **Geen project** of een project |
| Nota | |
| Storing: Wat faalde, Wanneer, Stuk (**Geen stuk** of stuk), Project, Ernst (**Hoog / Normaal**), Wat er gebeurde | |

## Schaar

**Doel:** fiscale assistent die de wettelijke belastingdruk zo laag mogelijk wil houden. Typ een vraag in **Vraag aan Schaar** en druk **Stuur**, of klik een voorgestelde vraag. Het gesprek blijft bewaard (ook in Agents → Logboek).

## Archief

**Doel:** bonnen, aankoopfacturen en contracten bewaren en eventueel boeken.

1. Kies **Soort** (**Bon / Aankoopfactuur / Contract / Ander**), **Datum**, **Bedrag excl. btw**, **Klant in het bestand** of **Leverancier in het bestand** (of **Geen**), **Nota** en **Bestand** (PNG, JPEG, WEBP, GIF of PDF, max. 700 KB).
2. **Opladen**.
3. Per document: **Open** (voorbeeld, **Sluit**), **Boek als kost** → kies **Leverancier** → **Bevestig boeking** (21% btw tenzij vrijgesteld), **Wis**.
