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

The Firefox manifest currently declares that the extension transmits no data.
Update `browser_specific_settings.gecko.data_collection_permissions` in
`wxt.config.ts` before adding features that send account, browsing, or page
data outside the browser.
