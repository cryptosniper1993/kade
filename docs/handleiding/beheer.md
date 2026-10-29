# Beheer

Schermen: **Setup**, **Zaak**, **Instellingen** en **Audit**.

## Setup

Alle configuratie en status op één pagina: zie [setup.md](setup.md).

## Zaak

**Doel:** de zaakfiche. Deze gegevens komen op facturen, bepalen je Peppol-ID, de btw-berekening en de fiscale regels.

### Stap voor stap

1. Vul alle velden in en druk **Fiche bewaren** ("Zaakfiche bewaard."). Zonder rechtsvorm wordt de fiche niet bewaard.
2. Voor een btw-nummer in bijberoep: **Rechtsvorm** *Eenmanszaak* en **Sociaal statuut** *Zelfstandige in bijberoep*; **Btw-regime** volgens je aangifte.
3. **Demokade**: **Demoboekjaar laden** vult voorbeeldgegevens; **Demo wissen** haalt ze weer weg.

| Veld | Opties |
| --- | --- |
| Naam | |
| Rechtsvorm | **Eenmanszaak**, **BV**, **VOF**, **CommV**; verplicht (er is geen standaardwaarde, eerst staat "Kies je rechtsvorm…") |
| Btw-nummer | bv. `BE0123.456.789` |
| Ondernemingsnummer | bepaalt je Peppol-ID `0208:…` |
| Adres | |
| Gemeente | met postcode, bv. `2000 Antwerpen` (nodig voor Peppol) |
| E-mail | |
| IBAN | komt op facturen en in de UBL |
| Btw-regime | **Btw-plichtig, kwartaalaangifte**, **Btw-plichtig, maandaangifte**, **Vrijstellingsregeling kleine ondernemingen (art. 56bis)** |
| Eigen omzetdrempel | alleen bij vrijstellingsregeling; leeg = wettelijke drempel van het jaar (€ 25.000 in 2025–2026, € 26.000 vanaf 2027). Overschrijd je de drempel met hoogstens 10%, dan verlies je de vrijstelling pas vanaf volgend jaar; Kade waarschuwt bij nadering, tolerantie en overschrijding. |
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

### Mailverbinding

Provider, afzender, Verbinden/Verbreek, Test verbinding en log van verzonden mails: zie [mail.md](mail.md).

### Thema

**Kleuren**: **KADE (messing)** of **JustAMinute (navy #104176, coral #E33737)**.

### Prospectie en verzendregels

| Veld | Uitleg |
| --- | --- |
| Max per dag | standaard 15 |
| Venster van / tot | standaard 08:30–11:00, di–do (Brussel) |
| Verboden namen | één per regel; blokkeert goedkeuring. Vertrouwelijk: staat enkel in de database |
| Start activiteit | voor de pro-rata vrijstellingsdrempel |
| Vrijstellingsdrempel | standaard €25.000 (meter op de Brug bij vrijstellingsregeling) |

### GROK BOTS

De Grok Bot-koppeling is verhuisd naar het hoofdonderdeel **GROK BOTS**: zie [grok-bots.md](grok-bots.md).

### Inrichting importeren

Plak of kies een JSON (zie [inrichting-voorbeeld.json](inrichting-voorbeeld.json)) met verboden namen, startdatum, klanten, projecten, taken en Grok Bots → **Importeren**. Herhalen maakt niets dubbel. Zo blijven vertrouwelijke gegevens uit de publieke repo.

## Audit

Elke goedkeuring, verzending, import, bot-oproep en instelling met tijd, actor en wie goedkeurde.

## Aanmelden in productie

Een productie-installatie (`NODE_ENV=production` met `GROK_PROJECT_ID` of `DATABASE_URL`) start niet als het aanmelden onveilig staat:

| Variabele | Vereiste |
| --- | --- |
| `VITE_AUTH_ENABLED` | niet `false` |
| `GROK_AUTH_CLIENT_ID`, `GROK_AUTH_CLIENT_SECRET` | ingevuld (anders zou de gedeelde preview-client gebruikt worden) |
| `BETTER_AUTH_SECRET` | ingevuld |
| `KADE_ALLOW_INSECURE_AUTH` | alleen `true` zetten als je bewust een afgeschermde demo zonder aanmelden draait; dan wordt de controle overgeslagen |

Lokaal (`npm run dev`) geldt deze controle niet.
