# Database: Neon (Postgres, Frankfurt)

Zonder `DATABASE_URL` gebruikt KADE een lokale PGlite-database (enkel ontwikkeling). In productie: Neon in **AWS eu-central-1 (Frankfurt)**.

## Stap voor stap

1. neon.tech → account → **New project**, regio **AWS Europe Central 1 (Frankfurt)**, Postgres 16/17.
2. **Connect**: kopieer twee URL's:
   - **Pooled** (host met `-pooler`): `postgresql://user:pass@ep-…-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require` → `DATABASE_URL`.
   - **Direct** (zonder `-pooler`) → `DATABASE_URL_UNPOOLED` (migraties).
3. Zet beide in Netlify (zie [hosting-netlify.md](hosting-netlify.md)). Of gebruik de Netlify-Neon-integratie: die zet `NETLIFY_DATABASE_URL(_UNPOOLED)`, KADE leest die ook.
4. Migreren: `DATABASE_URL=… npm run db:migrate` (lokaal) of automatisch in de build.
5. Controleer: **Beheer → Setup → Database (Neon)** = *OK* en het hostnaamdeel wordt getoond (zonder wachtwoord).

Driver: `pg` Pool (max 3 verbindingen, korte timeouts) over SSL, geschikt voor serverless.

## Backups en branching

- Neon bewaart een **restore-venster** (point-in-time; gratis plan beperkt, betaald langer). Herstellen: Console → **Branches → Restore** naar een tijdstip.
- Maak voor tests een **branch** (kopie van de data, copy-on-write) en gebruik die URL in een Netlify deploy preview.
- Eigen export: `pg_dump "$DATABASE_URL_UNPOOLED" > kade.sql`; terugzetten: `psql "$URL" < kade.sql`.
