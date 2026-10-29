# Peppol-provider opzetten (access point)

Sinds **1 januari 2026** moet een Belgische btw-plichtige onderneming B2B-facturen elektronisch versturen en kunnen ontvangen via **Peppol** (UBL, *Peppol BIS Billing 3.0*). Dat geldt ook in bijberoep. Het gratis overheidsplatform **Hermes** is gestopt op 31 december 2025, dus je hebt een **erkende Peppol-dienstverlener (access point)** nodig. Kade maakt zelf de UBL en praat via één REST-adapter met die provider.

> Kade verstuurt niets en meldt geen succes zolang er geen provider gekoppeld is.

## 1. Wat je nodig hebt

- Je **ondernemingsnummer** (KBO), bv. `0123.456.789`. Je Peppol-ID wordt dan **`0208:0123456789`** (schema 0208 = Belgisch ondernemingsnummer, 10 cijfers zonder punten).
- Een account bij een access point **met API** (Kade heeft een API nodig; een provider met alleen een webportaal werkt niet rechtstreeks).
- Toegang tot de server-instellingen (omgevingsvariabelen) waar Kade draait.

## 2. Een provider kiezen

Officiële lijsten:

- OpenPeppol, *Peppol Certified Service Providers* (sorteer op Peppol Authority **BOSA** voor België): <https://peppol.org/members/peppol-certified-service-providers/>
- FOD BOSA, Peppol in België: <https://digital.belgium.be/e-invoicing/PEPPOLinBelgium.html>
- Controle of iemand op Peppol staat: Peppol Directory <https://directory.peppol.eu>

Voorbeelden met een API (stand oktober 2026, controleer prijzen en voorwaarden zelf):

| Provider | Type | Notities |
| --- | --- | --- |
| **e-invoice.be** | Belgisch access point + SMP (BOSA) | REST-API `https://api.e-invoice.be/api`, sandbox-bedrijven (testmodus, niets gaat het netwerk op), API-sleutel per bedrijf, versturen in 2 stappen (`POST /api/documents/` en `POST /api/documents/{id}/send`), ontvangen en webhooks. Docs: <https://docs.e-invoice.be> |
| **Billit** | Access Point as a Service | White-label API, KYC van de onderneming. Docs: <https://docs.accesspoint.billit.eu> |
| **Ademico Software** | Belgisch access point + SMP (BOSA) | REST-API (OpenAPI), registratie van deelnemers via API, ontvangen via **webhooks of polling**, test-omgeving. <https://ademico-software.com/peppol/> |
| **Digiteal** | Erkend access point | Alleen API, alleen UBL BIS 3.0; inkomende documenten **alleen via webhooks** (geen polling); contract via sales. <https://doc.digiteal.eu/docs/peppol-access-point> |
| Boekhoudpakketten (bv. Accountable, Billit-portaal) | App met ingebouwde Peppol | Handig om zelf te factureren, maar meestal geen API om Kade aan te koppelen. Gebruik ze dan als ontvangstbus en download de UBL om in Kade op te laden (zie §7). |

Kies bij voorkeur een provider die **(1)** UBL BIS 3.0 rechtstreeks aanvaardt, **(2)** een sandbox heeft, **(3)** inkomende documenten via **polling** (ophalen) aanbiedt — dat is wat de knop *Ophalen via Peppol* in Kade doet.

## 3. Account openen en registreren

1. Maak een account aan bij de provider en doorloop de identiteitscontrole (KYC) van je onderneming.
2. Laat je onderneming **registreren als Peppol-deelnemer** met ID `0208:<ondernemingsnummer>` (bij de meeste providers één knop of één API-call). Heb je al een registratie bij een andere provider (bv. vroeger Hermes of je boekhoudapp), dan moet die eerst **overgezet of vrijgegeven** worden — een ID kan maar bij één access point tegelijk staan voor ontvangst.
3. Controleer na enkele minuten in de Peppol Directory dat je ID gevonden wordt.
4. Maak in het portaal van de provider een **API-sleutel** aan (eerst voor de sandbox/test, later voor productie).

## 4. Kade instellen

Vul eerst in Kade, **Beheer → Zaak**, je **Ondernemingsnummer**, **Gemeente** (bv. `2000 Antwerpen`), adres en IBAN in. Kade toont daarna je eigen Peppol-ID in **Beheer → Instellingen → Peppol**.

Zet dan op de server (als geheim, nooit in de code of in git):

| Variabele | Verplicht | Betekenis |
| --- | --- | --- |
| `PEPPOL_API_URL` | ja | Basis-URL van de API, zonder `/` op het einde |
| `PEPPOL_API_KEY` | ja | API-sleutel; Kade stuurt `Authorization: Bearer <sleutel>` |
| `PEPPOL_PROVIDER` | nee | Naam die Kade toont, bv. `e-invoice.be (sandbox)` |

Lokaal kan dat in de omgeving waarmee je `npm run dev` start; bij hosting (bv. Vercel) in de projectinstellingen → Environment Variables, daarna opnieuw deployen.

## 5. Testen in Kade

1. **Beheer → Instellingen → Peppol → Test verbinding.** Status wordt *verbonden* of je krijgt de foutcode van de provider.
2. **Finance → Klanten**: open een klant, vul **Peppol-ID** in (of het btw-nummer, dan leidt Kade `0208:…` af) en druk **Peppol-ontvanger?** om op te zoeken of de klant ontvangt.
3. **Versturen**: maak in **Finance → Facturen** een factuur en kies **Factuur OK en stuur uit** (boekt en verstuurt), of bij een geboekte factuur **Verstuur via Peppol**. De lijst toont *verzonden via Peppol* of *Peppol-fout* (fouttekst als tooltip). Met **UBL** download je het XML-bestand om het eventueel in de validator van je provider te testen.
4. **Ontvangen**: laat iemand (of de sandbox van je provider) een factuur naar je ID sturen, ga naar **Finance → Inkomend** en druk **Ophalen via Peppol**. De melding toont hoeveel nieuw / al gekend / mislukt.

## 6. Past de adapter bij jouw provider?

Kade gebruikt een **generiek contract** (bestand `src/lib/peppol-adapter.server.ts`):

| Functie | Verwachte call |
| --- | --- |
| Test verbinding | `GET {URL}/health` → 2xx |
| Ontvanger opzoeken | `GET {URL}/participants/{peppolId}` → `200 { "registered": true/false }` of 404 |
| Versturen | `POST {URL}/documents` met de UBL als `application/xml`, headers `X-Peppol-Receiver` en `X-Peppol-Sender` → 2xx `{ "id": … }` |
| Inbox | `GET {URL}/inbox` → `[{ "id": … }]` of `{ "documents": [{ "id": … }] }` |
| Document ophalen | `GET {URL}/inbox/{id}` → UBL-XML (of JSON `{ "xml": … }`) |
| Bevestigen | `POST {URL}/inbox/{id}/ack` → 2xx (404/405 wordt genegeerd) |

Geen enkele commerciële provider gebruikt exact deze paden. Controleer in de API-documentatie van jouw provider:

- **Authenticatie**: Bearer-token, eigen header (bv. `X-Api-Key`) of Basic auth (Ademico gebruikt Basic auth in hun voorbeeld)? Pas `headers` in `adapter()` aan.
- **Versturen**: aanvaardt de provider rauwe UBL-XML, of moet het JSON zijn / in twee stappen (aanmaken + versturen, zoals e-invoice.be)? Pas `send()` aan; de UBL komt van `buildPeppolUbl()`.
- **Ontvangen**: is er een polling-endpoint? Zo ja, pas `inbox()`, `fetchDocument()` en `ack()` aan. Biedt de provider **alleen webhooks** (zoals Digiteal), dan is een extra route nodig die het webhookbericht aanneemt en de UBL aan dezelfde opslagfunctie geeft (`store()` in `src/lib/ops-incoming.ts`); dat bestaat nog niet.
- **Opzoeken**: heeft de provider een lookup-endpoint, of moet dat via de Peppol Directory/SMP?
- **Testomgeving**: aparte URL of aparte sleutel? Zet die eerst in `PEPPOL_API_URL`/`PEPPOL_API_KEY`.

Na een aanpassing: `npx tsc --noEmit`, `npm test`, en test opnieuw stap 5.

## 7. Zonder API-koppeling

Krijg je facturen binnen in een portaal of boekhoudapp? Download de **UBL XML** en gebruik in **Finance → Inkomend** de knop **UBL XML opladen** (meerdere bestanden tegelijk kan). Dezelfde factuur twee keer opladen maakt geen dubbel: Kade herkent leverancier + factuurnummer.
