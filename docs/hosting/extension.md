> [!WARNING]
> The Serial browser extension is still under development. These requirements may change before release.

# Using the browser extension with self-hosted Serial

The official extension works with the hosted Serial app and self-hosted
instances without extension-specific configuration. In the extension, choose
the instance, sign in to it in the browser, and approve **Connect extension**.

## Requirements

- Run the latest Serial database migrations.
- Set `PUBLIC_BASE_URL` to the origin where users open Serial.
- Use HTTPS with a browser-trusted certificate, except on `localhost`,
  `127.0.0.1`, or `[::1]` during local development.
- Complete Serial's initial account setup before connecting.

For example:

```env
PUBLIC_BASE_URL=https://serial.example.com
```

Do not include a path or query string. If users access the same deployment
through another origin, add that origin to the existing `TRUSTED_ORIGINS`
setting.

No OAuth client ID, client secret, discovery endpoint, or proxy-hop setting is
needed. TLS may terminate at a reverse proxy; only the browser-facing origin
must use HTTPS.

Remote plain-HTTP origins such as `http://192.168.1.50:3000` are intentionally
rejected. Put trusted HTTPS in front of the service or expose it to the browser
through an encrypted loopback tunnel.

## Local development

Loopback HTTP is supported:

```env
PUBLIC_BASE_URL=http://localhost:3000
```

## Custom extension builds

Official Chrome and Firefox identity redirects are registered automatically.
A development or independently packaged build may receive a different redirect
from `browser.identity.getRedirectURL()`. Register it explicitly:

```env
SERIAL_EXTENSION_REDIRECT_URIS=https://extension-id.chromiumapp.org/serial-auth
```

Multiple values are comma-separated. Serial validates every redirect exactly;
wildcards, paths other than `/serial-auth`, queries, and fragments are rejected.

## Troubleshooting

1. Open the selected instance directly and confirm its certificate is trusted.
2. Confirm `PUBLIC_BASE_URL` matches its primary public origin.
3. Add any alternate origin to `TRUSTED_ORIGINS`.
4. Confirm the latest database migration has run.
5. For a custom extension build, register the exact identity redirect returned
   by the browser.

Do not bypass certificate warnings or disable TLS verification. Fix the
certificate or public origin instead.
