# Wat werkt er als Grok uitligt?

KADE is gebouwd om 1–2 dagen zonder Grok (xAI-API) en zonder Grok Bot-webhooks te werken.

| Onderdeel | Zonder Grok |
| --- | --- |
| Finance (klanten, leveranciers, offertes, facturen, inkomend, boeken, balans, inventaris, analyse, archief) | werkt volledig |
| Peppol, mailverbinding, social, Setup | werkt volledig (geen afhankelijkheid van `XAI_API_KEY`) |
| Projecten, taken, prospectie, goedkeuring, audit | werkt volledig |
| Loots, Schaar, Research, Hoofd, Bots (AI-antwoorden), ochtendbriefing | toont **"Grok tijdelijk onbereikbaar"**; de pagina blijft werken. Opnieuw proberen kan later |
| GROK BOTS-opdrachten | gaan in de **wachtrij (outbox)** en worden automatisch opnieuw verstuurd |

## Details

- AI-oproepen hebben een timeout van 25 s; webhooks naar Grok Bots 10 s. Een fout breekt nooit een pagina.
- KADE start ook zonder `XAI_API_KEY`; dan staan enkel de AI-functies uit.
- **Outbox**: bij netwerkfout, timeout, HTTP 408/429/5xx komt de opdracht in **GROK BOTS → Wachtrij**. Nieuwe pogingen na 1, 2, 4, … minuten, daarna elke 3 uur, tot 24 pogingen (ruim 2 dagen). Status: *wachtrij*, *verzonden*, *mislukt*, *geannuleerd*. Knoppen **Nu opnieuw proberen**, **Opnieuw** (ook voor *mislukt*), **Annuleer**. Een definitieve fout (bv. 401 verkeerde sleutel) gaat niet in de wachtrij: herstel de sleutel en stuur opnieuw.
- Nieuwe pogingen lopen telkens als iemand **GROK BOTS** of **Setup** opent (geen aparte cron nodig).
- **Setup** toont bovenaan de Grok-status: *bereikbaar*, *tijdelijk onbereikbaar*, *niet ingesteld* of *nog niet gebruikt*, plus het aantal opdrachten in de wachtrij. De status geldt per serverinstantie en wordt na een herstart opnieuw opgebouwd.
