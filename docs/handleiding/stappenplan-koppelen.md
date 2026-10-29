# Stappenplan: alles koppelen (voor Nick)

Eén lijst met alles wat jij nog zelf moet doen om KADE live te zetten en te koppelen. Werk ze in volgorde af en vink af.
**Er staan hier nooit geheime waarden.** Geheimen plak je enkel in **Netlify → Site configuration → Environment variables** (of in een veld in KADE dat ze gemaskeerd bewaart), nooit in git, chat of mail.

Na elke stap: **Beheer → Setup** in KADE toont per onderdeel *OK*, *ontbreekt* of *optioneel* en welke variabelen gezet zijn (nooit de waarde).

---

## 1. Neon-database

Detail: [database-neon.md](database-neon.md)

- [ ] Ga naar **console.neon.tech** → **New project**. Naam `kade`, regio **AWS Europe Central 1 (Frankfurt) / eu-central-1**, Postgres 16 of hoger.
- [ ] **Dashboard → Connect**: kies de branch `main`, zet **Connection pooling** aan → kopieer de URL (eindigt op `?sslmode=require`). Dat is `DATABASE_URL`.
- [ ] Zet **Connection pooling** uit → kopieer die URL. Dat is `DATABASE_URL_UNPOOLED` (voor migraties).
- [ ] Migraties draaien (eenmalig, op je eigen pc met de repo): `DATABASE_URL_UNPOOLED=… npm run db:migrate`. Plak de URL enkel in je terminal, niet in een bestand dat in git komt.
- [ ] **Controle**: Neon → **Tables** toont o.a. `companies`, `invoices`, `prospects`, `approvals`, `mail_settings`, `social_posts`. Na stap 2: Setup → kaart **Database** = *OK* (bron Postgres, niet PGlite).

## 2. Netlify-site, domein justaminute.be en env-variabelen

Detail: [hosting-netlify.md](hosting-netlify.md)

- [ ] **app.netlify.com → Add new site → Import an existing project → GitHub** → repo `cryptosniper1993/kade`, branch `main`. Build-instellingen komen uit `netlify.toml` (build `npm run build`, publish `dist`). Nog **niet deployen** tot de variabelen staan.
- [ ] **Site configuration → Environment variables → Add a variable**: zet de variabelen uit de tabel hieronder (scope *All* of minstens *Functions* en *Builds*).
- [ ] **Domain management → Add a domain** → `justaminute.be` (of `kade.justaminute.be`). Netlify toont de DNS-records.
- [ ] Bij je **DNS-beheerder** (waar justaminute.be geregistreerd is): voeg het `A`-record (apex) of `CNAME` (subdomein) toe zoals Netlify toont. **Raak de MX-records van Zoho niet aan.**
- [ ] Netlify → **HTTPS → Verify DNS → Provision certificate**.
- [ ] **Deploys → Trigger deploy → Deploy site**.
- [ ] **Controle**: `https://justaminute.be` opent het aanmeldscherm; Setup → kaart **Omgeving** toont de verplichte variabelen als gezet.

| Variabele | Waar haal je ze | Verplicht |
| --- | --- | --- |
| `DATABASE_URL` | Neon → Connect, pooled (stap 1) | ja |
| `DATABASE_URL_UNPOOLED` | Neon → Connect, zonder pooling (stap 1) | aanbevolen |
| `APP_URL` | je publieke adres, bv. `https://justaminute.be` (geen `/` op het einde) | ja (OAuth-redirects) |
| `VITE_AUTH_ENABLED` | `true` (staat al in `netlify.toml`) | ja |
| `BETTER_AUTH_SECRET` | zelf genereren (stap 3) | ja |
| `BETTER_AUTH_URL` | zelfde als `APP_URL` | ja |
| `GROK_AUTH_CLIENT_ID`, `GROK_AUTH_CLIENT_SECRET` | eigen aanmeld-client (stap 3) | ja in productie |
| `XAI_API_KEY` | console.x.ai → API Keys | optioneel (zonder: AI uit, rest werkt) |
| `MAIL_TOKEN_KEY` | zelf genereren (stap 3) | ja als je Outlook/Gmail koppelt |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT` | Azure app-registratie (stap 5) | optioneel (Outlook) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth-client (stap 5) | optioneel (Gmail) |
| `SMTP_PASSWORD` | je mailprovider (app-wachtwoord) | optioneel (SMTP) |
| `PEPPOL_PROVIDER`, `PEPPOL_API_URL`, `PEPPOL_API_KEY` | Peppol-provider (stap 4) | ja voor Peppol-facturen |
| `SOCIAL_TOKEN_KEY` | zelf genereren (stap 3) | optioneel (anders `MAIL_TOKEN_KEY`) |
| `META_APP_ID`, `META_APP_SECRET` | Meta-app (stap 7) | optioneel |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | TikTok-app (stap 7) | optioneel |
| `TIKTOK_AUDITED` | `true` enkel na geslaagde TikTok-audit | optioneel |
| `KADE_ALLOW_INSECURE_AUTH` | **niet zetten** in productie | nee |

## 3. Aanmeld-geheimen

Detail: [beheer.md](beheer.md#aanmelden-in-productie)

- [ ] Genereer drie lange willekeurige sleutels op je eigen pc, elk apart: `openssl rand -base64 48`. Plak ze rechtstreeks in Netlify als `BETTER_AUTH_SECRET`, `MAIL_TOKEN_KEY` en `SOCIAL_TOKEN_KEY`. Bewaar ze in je wachtwoordbeheerder. **Wijzig `MAIL_TOKEN_KEY`/`SOCIAL_TOKEN_KEY` later niet**, anders moet je mail en socials opnieuw verbinden.
- [ ] Maak een eigen aanmeld-client (Grok-aanmelden) aan met redirect `https://justaminute.be/api/auth/oauth2/callback/<provider-id>` (de exacte URL toont de client-configuratie) → zet `GROK_AUTH_CLIENT_ID` en `GROK_AUTH_CLIENT_SECRET`.
- [ ] Zet `BETTER_AUTH_URL` = `APP_URL`. Redeploy.
- [ ] **Controle**: de site start (een onveilige configuratie start bewust niet), je kan aanmelden, Setup → kaart **Aanmelden** = *OK*.

## 4. Peppol-provider en Peppol-ID

Detail: [peppol-provider.md](peppol-provider.md)

- [ ] Vul eerst in KADE **Beheer → Zaak** ondernemingsnummer, adres, gemeente en IBAN in → **Fiche bewaren**. Je Peppol-ID wordt `0208:<10 cijfers>`.
- [ ] Kies een Peppol-accesspoint (zie de vergelijking in peppol-provider.md), maak er een account aan en laat je Peppol-ID **registreren** (SMP/Peppol Directory).
- [ ] Kopieer uit het provider-dashboard de **API-URL** en een **API-sleutel** → Netlify: `PEPPOL_PROVIDER`, `PEPPOL_API_URL`, `PEPPOL_API_KEY`. Redeploy.
- [ ] **Controle**: **Beheer → Instellingen → Peppol → Test verbinding** = *verbonden*; je ID is vindbaar op directory.peppol.eu. Stuur pas na deze controle een eerste echte factuur.

## 5. Mail: Outlook (Azure) of Gmail (Google)

Detail: [mail.md](mail.md). Zoho biedt hier geen koppeling: kies dan **Mailprogramma (mailto/.eml)**, dat werkt zonder iets te registreren.

**Outlook / Microsoft 365**
- [ ] **portal.azure.com → Microsoft Entra ID → App registrations → New registration**. Naam `KADE`, accounttypes naar keuze, **Redirect URI** type *Web*: `https://justaminute.be/api/mail/callback`.
- [ ] **API permissions → Add → Microsoft Graph → Delegated**: `Mail.Send`, `offline_access`, `User.Read` → **Grant admin consent** (indien gevraagd).
- [ ] **Certificates & secrets → New client secret** → kopieer de *Value* (enkel nu zichtbaar).
- [ ] Netlify: `MS_CLIENT_ID` (*Application (client) ID*), `MS_CLIENT_SECRET` (de Value), `MS_TENANT` (*Directory (tenant) ID* of `common`). Redeploy.

**Gmail / Google Workspace**
- [ ] **console.cloud.google.com → APIs & Services → Library → Gmail API → Enable**.
- [ ] **OAuth consent screen**: type *External* (of *Internal* bij Workspace), scope `https://www.googleapis.com/auth/gmail.send`, voeg jezelf toe als testgebruiker.
- [ ] **Credentials → Create credentials → OAuth client ID → Web application**, redirect `https://justaminute.be/api/mail/callback` → kopieer client-ID en secret naar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Redeploy.

**In KADE**
- [ ] **Beheer → Instellingen → Mailverbinding**: provider kiezen, afzender invullen → **Bewaren** → **Verbinden** → aanmelden en toestaan.
- [ ] **Controle**: **Test verbinding** = OK (er wordt niets verzonden); Setup → kaart **Mailverbinding** = *OK*.

## 6. Grok Bot-webhooks per bot

Detail: [grok-bots.md](grok-bots.md), [bot-api.md](bot-api.md)

Per bot (sales-bot en elke projectbot):
- [ ] Maak in Grok Bot een **routine met webhook-trigger** ("Opdrachten uit KADE") → kopieer de **webhook-URL** en de **sender key**.
- [ ] KADE → **GROK BOTS → + Bot toevoegen**: naam, rol, scope (**sales** of **project** + project), webhook-URL, sleutel, header-type → **Bewaren**.
- [ ] Klik **Nieuwe API-sleutel** → kopieer de `kade_bot_…`-sleutel (enkel nu zichtbaar) en zet die in de instructies/geheimen van die Grok Bot zodat hij de bot-API kan gebruiken.
- [ ] **Controle**: **Test** bij de bot = *bereikt*; stuur een korte opdracht en zie ze in het logboek. Faalt de bot tijdelijk, dan staat de opdracht in **Wachtrij (outbox)** ([grok-storing.md](grok-storing.md)).

## 7. Socials: Meta-app en TikTok-app

Detail: [social.md](social.md)

**Meta (Facebook-pagina + Instagram)**
- [ ] Zet Instagram om naar een **professioneel account** en koppel het aan je **Facebook-pagina** (Instagram → Instellingen → Accounttype; Pagina → Instellingen → Gekoppelde accounts).
- [ ] **developers.facebook.com → My Apps → Create app** → type *Business*, koppel je **Business Portfolio**.
- [ ] Voeg **Facebook Login for Business** toe; **Valid OAuth Redirect URIs**: `https://justaminute.be/api/social/callback?p=meta`.
- [ ] **App settings → Basic**: kopieer **App ID** en **App secret** → Netlify `META_APP_ID`, `META_APP_SECRET`. Vul privacybeleid-URL en gegevensverwijdering-URL in. Redeploy.
- [ ] Test in ontwikkelmodus: KADE → **Social → Verbinden** (Facebook).
- [ ] **App Review → Permissions**: vraag *Advanced access* voor de permissies in social.md, met schermopname (login + echte post) per permissie. Doe ook **Business Verification**. Daarna app op **Live**.

**TikTok**
- [ ] **developers.tiktok.com → Manage apps → Connect an app**. Voeg **Login Kit** en **Content Posting API** toe (Direct Post aan), scopes `user.info.basic`, `video.publish`, `video.list`.
- [ ] Redirect URI: `https://justaminute.be/api/social/callback?p=tiktok`. Verifieer je domein of URL-prefix voor media (`justaminute.be`).
- [ ] Kopieer **Client key** en **Client secret** → Netlify `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`. Redeploy. Dien de app in ter goedkeuring.
- [ ] Test: KADE → **Social → Verbinden** (TikTok), post naar je **privé** account.
- [ ] Wil je publiek posten: vraag de **audit** aan; na goedkeuring `TIKTOK_AUDITED=true`.
- [ ] **Controle**: Setup → **Socials: status** toont *Verbonden* per platform.

## 8. DMARC (p=none) bij Zoho-mail

Detail: [setup.md](setup.md) (Zoho/DMARC-checklist)

- [ ] Controleer in Zoho Mail Admin → **Domains → justaminute.be** dat **SPF** (`v=spf1 include:zohomail.eu ~all`) en **DKIM** groen staan.
- [ ] Voeg bij je DNS-beheerder een **TXT**-record toe: naam `_dmarc`, waarde `v=DMARC1; p=none; rua=mailto:<jouw-adres>@justaminute.be`.
- [ ] **Controle**: na een uur via een DMARC-checker (bv. mxtoolbox.com → DMARC Lookup) zichtbaar; vink het af in de Zoho/DMARC-checklist op Setup. Later eventueel `p=quarantine`.

## 9. Demogegevens wissen

- [ ] Enkel in de **productie**-database en enkel als je zeker bent: **Beheer → Zaak → Demokade → Demo wissen**. Dit raakt alleen demogegevens.
- [ ] Laad je echte inrichting: **Beheer → Instellingen → Inrichting importeren** met je eigen JSON (houd dat bestand buiten git; voorbeeld: [inrichting-voorbeeld.json](inrichting-voorbeeld.json)). Importeer prospecten via **Prospectie → Import CSV**.
- [ ] **Controle**: de demobanner is weg; Brug en Finance tonen enkel je eigen cijfers.

## 10. Eindcontrole op Setup

- [ ] **Beheer → Setup**: alle verplichte kaarten *OK* (zaakfiche, facturen, Peppol, mail, database, omgeving, aanmelden, verzendregels).
- [ ] Optionele kaarten bewust gekozen: Grok (AI), Grok Bots, socials, thema.
- [ ] Grok-status *bereikbaar*, wachtrij 0.
- [ ] Doe één volledige proef: prospect → concept → **Goedkeuring** → verzenden binnen het venster; factuur → PDF → mailen; social-concept.
- [ ] Bekijk **Beheer → Audit**: alle stappen staan erin.
