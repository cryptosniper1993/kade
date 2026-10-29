# Beheer

Schermen: **Zaak** en **Instellingen**.

## Zaak

**Doel:** de zaakfiche. Deze gegevens komen op facturen, bepalen je Peppol-ID, de btw-berekening en de fiscale regels.

### Stap voor stap

1. Vul alle velden in en druk **Fiche bewaren** ("Zaakfiche bewaard.").
2. Voor een btw-nummer in bijberoep: **Rechtsvorm** *Eenmanszaak* en **Sociaal statuut** *Zelfstandige in bijberoep*; **Btw-regime** volgens je aangifte.
3. **Demokade**: **Demoboekjaar laden** vult voorbeeldgegevens; **Demo wissen** haalt ze weer weg.

| Veld | Opties |
| --- | --- |
| Naam | |
| Rechtsvorm | **Eenmanszaak**, **BV**, **VOF**, **CommV** |
| Btw-nummer | bv. `BE0123.456.789` |
| Ondernemingsnummer | bepaalt je Peppol-ID `0208:…` |
| Adres | |
| Gemeente | met postcode, bv. `2000 Antwerpen` (nodig voor Peppol) |
| E-mail | |
| IBAN | komt op facturen en in de UBL |
| Btw-regime | **Btw-plichtig, kwartaalaangifte**, **Btw-plichtig, maandaangifte**, **Vrijstellingsregeling kleine ondernemingen (art. 56bis)** |
| Sociaal statuut | **Zelfstandige in hoofdberoep**, **Zelfstandige in bijberoep** |
| Afsluitmaand | einde boekjaar |

## Instellingen

Vier panelen.

### Naam van de interface

**Naam van de interface** (standaard `KADE`) → **Naam bewaren**. Verschijnt bovenaan en in de venstertitel.

### Hoofdstem

| Veld | Uitleg |
| --- | --- |
| Naam van de hoofdstem | naam van de assistent in Hoofd |
| Stem van deze computer | **Automatisch, bij voorkeur Nederlands** of een stem van de browser |
| Taal waarin je inspreekt | keuzelijst met talen voor spraakherkenning |
| Snelheid (0,7–1,5), Toonhoogte (0,7–1,4), Volume (0,2–1) | schuifregelaars |
| Antwoorden hardop | vinkje |
| Na het inspreken meteen sturen | vinkje |

Knoppen: **Stem bewaren**, **Test** (laat de stem een testzin zeggen), **Stop**.

### Peppol

Toont je **Eigen Peppol-ID** (uit de zaakfiche), de **Provider** en de **Status** (*niet verbonden*, *ingesteld, nog niet getest*, *verbonden*). Knop **Test verbinding**. De koppeling zelf gebeurt met server-variabelen: zie [peppol-provider.md](peppol-provider.md).

### Grok Bot

Koppeling waarmee Kade opdrachten naar Grok Bot stuurt (via een webhook-routine van Grok Bot).

| Veld / knop | Uitleg |
| --- | --- |
| Webhook-URL | URL van de routine "Opdrachten uit Kade" |
| Sender key | geheime sleutel van de webhook; na bewaren alleen gemaskeerd getoond, leeg laten om te behouden |
| Hoe de sleutel meesturen | **Authorization: Bearer &lt;sleutel&gt;** of **Eigen header** |
| Headernaam | bij eigen header, bv. `X-Sender-Key` |
| **Bewaren** | bewaart de koppeling |
| **Test verbinding** | stuurt een testbericht; status *Niet gekoppeld*, *Gekoppeld, nog niet getest* of het resultaat met tijdstip |
| **Sleutel wissen** | verwijdert de sleutel |

Daarna kan je opdrachten sturen vanuit Agents → Bots en het resultaat zien in Agents → Logboek → Grok Bot.
