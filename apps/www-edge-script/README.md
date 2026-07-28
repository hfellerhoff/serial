# Serial website edge script

Bunny Edge Scripting middleware for the `www.serial.tube` Pull Zone. A request
for the website homepage that includes a Better Auth session cookie is answered
with a `302` redirect to `https://app.serial.tube` before cached website content
is served.

The cookie is only used as a signed-in hint. The edge script does not validate
the session, so an expired cookie may send a visitor to the app's sign-in page.

## Cookie scope

The production app must set `COOKIE_DOMAIN=.serial.tube` so both
`app.serial.tube` and `www.serial.tube` receive the Better Auth session cookie.
This middleware reads it only on `www.serial.tube` and redirects to
`app.serial.tube`. A standard domain cookie cannot be restricted to two sibling
hosts, so browsers also send it to other `*.serial.tube` hosts. The edge
redirect does not require CORS access to the app.

## Development

From the monorepo root:

```sh
pnpm --filter @serial/www-edge-script typecheck
pnpm --filter @serial/www-edge-script lint
pnpm --filter @serial/www-edge-script test:unit
pnpm --filter @serial/www-edge-script build:artifact
```

The deployable bundle is written to `apps/www-edge-script/dist/index.js`.

## Deployment

Pushes to `main` that affect this package run
`.github/workflows/deploy-www-edge-script.yml`. The workflow requires repository
secrets named `WWW_BUNNY_EDGE_SCRIPT_ID` and
`WWW_BUNNY_EDGE_SCRIPT_DEPLOY_KEY`.

In Bunny, create a Middleware Edge Script and connect it to the website Pull
Zone. Add an Edge Rule that matches `https://www.serial.tube/` and sets
**Override Cache Time** to `0`. The script uses the stable `onOriginRequest`
hook, so the homepage must bypass the cache for the redirect to run on every
request.
