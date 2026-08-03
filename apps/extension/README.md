# Serial browser extension

The browser extension is built with [WXT](https://wxt.dev/) and React.

From the repository root, install dependencies and start the Chromium
development build:

```sh
pnpm install
pnpm dev:extension
```

Run a Firefox development build with:

```sh
pnpm --filter @serial/extension dev:firefox
```

The root `build`, `typecheck`, `lint`, and `format` commands include this
workspace automatically.

Production Chrome and Firefox store deployment is documented in
[`../../.github/EXTENSION_DEPLOYMENT.md`](../../.github/EXTENSION_DEPLOYMENT.md).
The first store listings are created manually; affected updates are submitted
from `main` by GitHub Actions after that bootstrap is complete.

The Firefox source archive contains the locked monorepo inputs needed to
reproduce the submitted package. From the archive root, use the version from
the submitted extension's `manifest.json`:

```sh
corepack pnpm install --frozen-lockfile
SERIAL_EXTENSION_STORE_BUILD=true SERIAL_EXTENSION_VERSION=<manifest-version> corepack pnpm --filter @serial/extension zip:firefox
```

Run the app in demo mode and open it in WXT's extension-enabled Chrome test
browser:

```sh
pnpm dev:demo
# Equivalent:
pnpm dev:demo:chrome
```

Use Firefox instead with:

```sh
pnpm dev:demo:firefox
```

There is no Safari demo command because WXT's development runner does not open
Safari. Safari-targeted extensions must be built and packaged in a native app
with Apple's tooling before they can be loaded in Safari.

## Permissions and data flow

The extension requests only the capabilities needed for an explicit Bookmark
save:

- `activeTab` and `scripting` let the popup read and extract the current page
  after the user opens Serial. They do not grant permanent access to browsing
  history.
- `identity` completes the approved connection to a Serial instance.
- `storage` keeps the selected instance and its opaque extension session token
  in the browser.
- Optional host access is requested for the selected HTTPS Serial instance, or
  for a loopback HTTP instance during local development. Signing out removes
  that host access.

The Firefox manifest declares `authenticationInfo`, `browsingActivity`,
`websiteActivity`, and `websiteContent` because signing in and opening the popup
transmits the active page URL, the explicit save action, and a sanitized reader
capture to the selected Serial server. Firefox 140 or later is required so this
consent appears in Firefox's built-in installation flow.

The extension sends the page URL, extracted title and preview metadata,
sanitized readable content when extraction succeeds, and declared Feed links.
It never sends page cookies, credentials, request headers, the raw DOM, or the
pre-extraction page source. The selected Serial server stores the Bookmark and
may perform bounded Feed discovery only when the page declares no Feeds.

Before the first Chrome Web Store release, replace the checked-in manifest key
with the key assigned to the uploaded extension. Local and unpacked builds use
that key to preserve the Chrome extension ID. Store submission ZIPs omit the
development-only `key` field because the Chrome Web Store assigns identity from
the listing. The identity tests derive the Chrome and Firefox redirect URLs from
their manifest identities and ensure the server allowlist stays in sync.
