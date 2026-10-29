# Hosting op Netlify

justaminute.be staat al op Netlify; KADE kan daar als aparte site (bv. `kade.justaminute.be`) draaien.

1. Netlify → **Add new site → Import from Git** → repo `cryptosniper1993/kade`, branch `main`.
2. Build staat in `netlify.toml`: `npm run build`, `NITRO_PRESET=netlify`, Node 22. Netlify Functions worden door Nitro aangemaakt.
3. **Site configuration → Environment variables** (nooit in git):

| Variabele | Verplicht | Uitleg |
| --- | --- | --- |
| `DATABASE_URL` | ja | Neon pooled URL, zie [database-neon.md](database-neon.md) |
| `DATABASE_URL_UNPOOLED` | aanbevolen | Neon direct URL, voor migraties tijdens de build |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | ja | aanmelden |
| `VITE_AUTH_ENABLED` | ja | `true` (staat in netlify.toml) |
| `XAI_API_KEY` | nee | AI-functies |
| `MAIL_TOKEN_KEY`, `APP_URL`, `MS_*`, `GOOGLE_*`, `SMTP_PASSWORD` | nee | [mail.md](mail.md) |
| `PEPPOL_*` | nee | [peppol-provider.md](peppol-provider.md) |

4. **Deploy**. Migraties lopen via `npm run db:migrate` tijdens de build tegen `DATABASE_URL`.
5. Domein: **Domain management → Add a domain** → `kade.justaminute.be` (CNAME naar de Netlify-site).
6. Controleer op **Beheer → Setup**: alle verplichte env-variabelen *OK*.

## DNS en mail (optioneel)

Zoho Mail: SPF `include:zoho.eu`, DKIM aan in Zoho, en eventueel DMARC `v=DMARC1; p=none; rua=mailto:dmarc@justaminute.be`. Zoho gratis heeft geen SMTP: KADE gebruikt dan mailto/.eml.

## Branding

Thema **JustAMinute** (navy `#104176`, coral `#E33737`) kies je in **Beheer → Instellingen → Thema**.
