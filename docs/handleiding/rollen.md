# Rollen en rechten

Een **zaak** kan meerdere accounts als lid hebben. Elk lid heeft precies één rol. De rechten worden **op de server** gecontroleerd in elke schrijvende server function; knoppen verbergen in de interface is alleen extra comfort.

De matrix staat op één plek in de code: `src/lib/auth/permissions.ts` (`PERMISSIONS`). Pas je die aan, werk dan ook deze tabel bij.

## Rollen

| Rol | Kort |
| --- | --- |
| **Eigenaar** | alles, ook leden en instellingen beheren |
| **Boekhouder** | financiën en btw; ziet alles, geen bots of beheer |
| **Medewerker** | dagelijks werk en concepten opmaken; geen geld-acties |
| **Alleen lezen** | ziet alles, wijzigt niets |

## Wie mag wat

| Stap | Eigenaar | Boekhouder | Medewerker | Alleen lezen |
| --- | :---: | :---: | :---: | :---: |
| Alles bekijken | ✓ | ✓ | ✓ | ✓ |
| Dagelijks werk (taken, projecten, personen, documenten, inventaris, incidenten, inkomende factuur uploaden) | ✓ | – | ✓ | – |
| Concept-offertes en -facturen opmaken, relaties bijhouden | ✓ | ✓ | ✓ | – |
| **1. Facturen en offertes versturen** (factuur uitreiken, via Peppol sturen, creditnota, offerte op *verstuurd*) | ✓ | ✓ | – | – |
| **2. Btw-aangifte indienen** (voorbereiden, listings) | ✓ | ✓ | – | – |
| **3. Peppol en inkomende facturen goedkeuren** (ophalen, status, leverancier koppelen, verwijderen) | ✓ | ✓ | – | – |
| Boekingen en betalingen (journaal, inkomende factuur boeken/betaald, factuur betaald, afschrijvingen) | ✓ | ✓ | – | – |
| **4. Bots en agents laten handelen** (bots, Hoofd, Loots, Schaar, Research, mail zoeken, Grok Bot-opdracht) | ✓ | – | – | – |
| **5. Leden en instellingen beheren** (leden, zaakfiche, interfacenaam, Peppol-test, Grok Bot-instellingen, demo laden/wissen) | ✓ | – | – | – |

Wie iets probeert wat zijn rol niet mag, krijgt de melding *Geen toegang: … mag "…" niet.* en er wordt niets bewaard.

## Leden beheren

Scherm **Instellingen → Leden en rollen**. Iedereen ziet zijn eigen rol en de ledenlijst; alleen een Eigenaar kan wijzigen.

1. **Uitnodigen**: vul **E-mailadres** en **Rol** in en druk **Uitnodigen**. Kade verstuurt (nog) **geen** mail: laat de persoon zich aanmelden met precies dat adres. Bij de eerste aanvraag na het aanmelden komt het account in jouw zaak terecht.
2. **Rol wijzigen**: kies een andere rol in de keuzelijst naast het lid.
3. **Verwijderen**: **Verwijderen** naast het lid. Het account valt terug op een eigen, lege zaak.

Regels:

- Een zaak heeft altijd minstens één **Eigenaar**: de laatste Eigenaar kan je niet verwijderen of degraderen.
- Een account hoort bij precies één zaak. Een bestaand account kan je alleen uitnodigen als zijn eigen zaak leeg is (geen zaakfiche, geen andere leden); anders vraagt Kade een ander adres.

## Migratie

Migratie `0014_rollen.sql` maakt de tabel `zaak_members` en maakt elke bestaande gebruiker **Eigenaar** van zijn eigen zaak. Er verhuist geen enkele rij: de zaak gebruikt dezelfde id als vroeger (`user_id` van de eigenaar), dus alle gegevens blijven waar ze waren. Een account zonder lidmaatschap wordt bij de eerste aanvraag automatisch Eigenaar van zijn eigen zaak, zoals voorheen.
