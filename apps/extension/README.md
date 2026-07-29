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

The Firefox manifest declares `authenticationInfo` because signing in transmits
account authentication data to the selected Serial server. Firefox 140 or later
is required so this consent appears in Firefox's built-in installation flow.
Keep the declaration current if the extension begins transmitting other data.

Before the first Chrome Web Store release, replace the checked-in manifest key
with the key assigned to the uploaded extension. The identity tests derive the
Chrome and Firefox redirect URLs from their manifest identities and ensure the
server allowlist stays in sync.
