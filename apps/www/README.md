# Serial website

The public marketing website for [Serial](https://github.com/megaflorasoftware/serial), served at [serial.tube](https://serial.tube). The application is in the same monorepo under `apps/app` and is hosted at [app.serial.tube](https://app.serial.tube).

Built with [Astro](https://astro.build) and Tailwind CSS 4.

## Pages

- `/` — landing page (formerly `/welcome` in the app)
- `/pricing` — main-instance pricing
- `/guides`, `/guides/[slug]` — guide articles (content in `src/content/guides`)
- `/releases`, `/releases/[slug]` — release notes
- `/releases/rss.xml` — release notes RSS feed
- `/sitemap.xml`, `/.well-known/site.standard.publication`
- `/api/og/{releases,guides}/[slug].png` — generated Open Graph images

## Content

Guides live in `src/content/guides` and release notes in `src/content/releases`, both loaded through Astro content collections (`src/content.config.ts`).

## Signed-in redirect

The site is fully static. Bunny middleware in `apps/www-edge-script` checks for the shared Better Auth session cookie on requests to `https://www.serial.tube/` and redirects likely signed-in visitors to the app before cached HTML is served. The edge script only acts on the `www` hostname and does not require CORS access to the app.

## Deployment

Pushes to `main` run `.github/workflows/deploy-www.yml`, which builds the site, reconciles `apps/www/dist/` with Bunny Storage, and purges the Bunny pull-zone cache. Required repo secrets: `WWW_BUNNY_STORAGE_ZONE_ENDPOINT`, `WWW_BUNNY_STORAGE_ZONE_NAME`, `WWW_BUNNY_STORAGE_ZONE_PASSWORD`, `WWW_BUNNY_API_KEY`, `WWW_BUNNY_PULL_ZONE_ID`; repo variables: `WWW_APP_URL`, `WWW_SUPPORT_EMAIL_ADDRESS`, `WWW_STANDARD_SITE_PUBLICATION_URI`, `WWW_UMAMI_WEBSITE_ID`, `WWW_UMAMI_SRC`. The canonical host is `www.serial.tube` — redirect the apex domain to it at the DNS/CDN level.

## Development

```sh
pnpm install
pnpm --filter @serial/www dev
pnpm --filter @serial/www build # static output in apps/www/dist/
```

Environment variables are documented in `.env.example`.

## Standard.Site sync

`pnpm --filter @serial/www standard-site:sync` publishes guides and release notes as `site.standard.document` records to an AT Protocol PDS, reading the markdown in `src/content` directly. Use `--dry-run` to preview and `--allow-large-delete` to override the delete guard. Requires the `WWW_STANDARD_SITE_*` variables from `.env.example`. The GitHub workflow always supports manual runs when credentials are configured; automatic push-triggered syncs also require the repository variable `WWW_STANDARD_SITE_SYNC_ENABLED=true`.
