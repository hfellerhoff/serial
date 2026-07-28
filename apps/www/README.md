# serial-www

The public marketing website for [Serial](https://github.com/megaflorasoftware/serial), served at [serial.tube](https://serial.tube). The app itself lives in the `serial` repo and is hosted at [app.serial.tube](https://app.serial.tube).

Built with [Astro](https://astro.build) and Tailwind CSS 4.

## Pages

- `/` — landing page (formerly `/welcome` in the app)
- `/pricing` — main-instance pricing
- `/guides`, `/guides/[slug]` — guide articles (content in `src/content/guides`)
- `/releases`, `/releases/[slug]` — release notes
- `/sitemap.xml`, `/.well-known/site.standard.publication`
- `/api/og/{releases,guides}/[slug].png` — generated Open Graph images

## Content

Guides live in `src/content/guides` and release notes in `src/content/releases`, both loaded through Astro content collections (`src/content.config.ts`).

Note: the app repo keeps its own copy of the release markdown (`serial/src/content/releases`) to power the in-app "new release" toast — add new release notes to both repos.

## Signed-in redirect

The site is fully static, so the landing page checks for a session client-side: a script on `/` calls `PUBLIC_APP_URL/api/auth/get-session` with credentials and redirects signed-in visitors to the app. This requires the website origin (`https://www.serial.tube`) to be listed in the app's `TRUSTED_ORIGINS` env var so the CORS request is allowed.

## Deployment

Pushes to `main` run `.github/workflows/deploy.yml`, which builds the site and uploads `dist/` to Bunny Storage, then purges the Bunny pull-zone cache. Required repo secrets: `BUNNY_STORAGE_HOSTNAME`, `BUNNY_STORAGE`, `BUNNY_API_STORAGE`, `BUNNY_API`, `BUNNY_PULL_ZONE_ID`; repo variables: `PUBLIC_SUPPORT_EMAIL_ADDRESS`, `PUBLIC_STANDARD_SITE_PUBLICATION_URI`. The canonical host is `www.serial.tube` — redirect the apex domain to it at the DNS/CDN level.

## Development

```sh
pnpm install
pnpm dev
pnpm build      # static output in dist/, preview with `pnpm preview`
```

Environment variables are documented in `.env.example`.

## Standard.Site sync

`pnpm standard-site:sync` publishes guides and release notes as `site.standard.document` records to an AT Protocol PDS, reading the markdown in `src/content` directly. Use `--dry-run` to preview and `--allow-large-delete` to override the delete guard. Requires the `STANDARD_SITE_*` variables from `.env.example`.
