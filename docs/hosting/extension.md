> [!WARNING]
> This guide is a work in progress and is incomplete. The Serial browser extension is still under development, and its hosting requirements may change before release.

# Using the browser extension with self-hosted Serial

The browser extension works with the hosted Serial app and with self-hosted
instances that have a normal HTTPS address. Deployments whose application
runtime sees the original public HTTPS URL do not require additional proxy
configuration.

## Supported environments

- The hosted Serial app.
- Self-hosted instances on Coolify, Vercel, or similar services with a trusted HTTPS address.
- Docker or source-based deployments available through a trusted HTTPS address.
- Local development instances opened through `localhost`, `127.0.0.1`, or `[::1]`.

## Unsupported environments

- Remote HTTP addresses such as `http://192.168.1.50:3000` or `http://serial.local`. Remote HTTP access is unavailable for security reasons.
- HTTPS addresses with a certificate that the browser does not trust.

If your instance already opens through a trusted HTTPS address, no additional setup should be necessary. The remaining information is intended for developers and people configuring custom networks or extension builds.

## Custom environments and additional information

### Requirements

Before connecting the extension, make sure that:

- Serial is up to date and its database migrations have completed.
- `PUBLIC_BASE_URL` is the public origin used to open Serial in the browser.
- The public origin uses HTTPS, except for loopback development addresses.
- A reverse proxy forwards the original host and protocol to Serial.
- At least one user has completed the initial Serial setup.

The official extension identity is registered automatically. Most self-hosted instances do not need any extension-specific environment variables.

### Configure the public origin

Set `PUBLIC_BASE_URL` to the exact origin that extension users will select:

```env
PUBLIC_BASE_URL=https://serial.example.com
```

Do not include a path, query string, or trailing route.

If users can open the same instance through additional public origins, add them to `TRUSTED_ORIGINS` as a comma-separated list:

```env
PUBLIC_BASE_URL=https://serial.example.com
TRUSTED_ORIGINS=https://feeds.example.com,https://serial.example.net
```

The extension validates that every authentication endpoint remains on the selected origin. An alias that is not trusted will therefore fail rather than silently authenticating through a different host.

### Configure a reverse proxy

TLS may terminate at a reverse proxy while the proxy communicates with Serial over HTTP. The connection from the browser to the proxy must still use HTTPS.

The proxy must preserve or set:

- `Host` or `X-Forwarded-Host` to the public host.
- `X-Forwarded-Proto` to the public protocol, normally `https`.
- `X-Forwarded-For` with a trustworthy client IP chain if the deployment relies on rate limiting.

Set `TRUSTED_PROXY_HOPS` to the number of trusted proxies between the browser
and Serial. Its secure default is `0`, which ignores all forwarded headers. A
single reverse proxy normally uses:

```env
TRUSTED_PROXY_HOPS=1
```

When proxy trust is enabled and either forwarded origin header is present,
Serial requires both `X-Forwarded-Host` and `X-Forwarded-Proto` to be valid.
The trusted proxy must replace client-supplied values rather than pass them
through.

Incorrect forwarded host or protocol values can cause Serial and the extension to calculate different OAuth issuers. When that happens, the extension rejects the authentication response.

### Access Serial on a private network

Use one of these approaches when Serial runs on a home server, NAS, or another private-network device.

#### Add HTTPS in front of Serial

Place an HTTPS reverse proxy in front of the existing HTTP service. The certificate must be trusted by every browser device that will use the extension.

Common certificate approaches include:

- A public domain and publicly trusted certificate.
- Split DNS with a certificate obtained through a DNS challenge.
- A private certificate authority installed as trusted on each client device.
- An authenticated private-network or tunnel service that provides an HTTPS origin.

Serial may continue using HTTP between the reverse proxy and the application on a protected internal network.

#### Use an encrypted loopback tunnel

For individual or administrative access, create an encrypted tunnel that exposes Serial on the browser device as `127.0.0.1` or `[::1]`. The extension permits HTTP loopback origins because their traffic does not leave the device unencrypted.

For example, an SSH local-forwarding tunnel can expose a remote Serial service at an address such as:

```text
http://127.0.0.1:3000
```

Set up the tunnel before connecting or using the extension. The tunnel must protect the connection between the browser device and the remote server.

### Loopback development

For local development, the extension accepts HTTP on:

- `localhost`
- `127.0.0.1`
- `[::1]`

For example:

```env
PUBLIC_BASE_URL=http://localhost:3000
```

HTTP is allowed for these addresses only. OAuth guidance treats loopback HTTP differently because the unencrypted request remains on the same device. See [OAuth 2.0 for Native Apps, section 8.3](https://www.rfc-editor.org/rfc/rfc8252.html#section-8.3).

### Custom extension identities

Development builds or independently packaged extensions may receive an identity redirect URI that differs from the official Chrome or Firefox extension.

Use `browser.identity.getRedirectURL()` in that build to obtain the redirect URI, then add it to `SERIAL_EXTENSION_REDIRECT_URIS`:

```env
SERIAL_EXTENSION_REDIRECT_URIS=https://extension-id.chromiumapp.org/serial-auth
```

Multiple redirect URIs must be comma-separated. Serial validates their scheme, host format, and path at startup.

### Troubleshooting

If the extension cannot connect:

1. Open the selected Serial origin directly and confirm that its certificate is trusted.
2. Confirm that `PUBLIC_BASE_URL` exactly matches the selected origin.
3. Add any alternate public origin to `TRUSTED_ORIGINS`.
4. Check that the proxy sends the public host and `X-Forwarded-Proto: https`.
5. Confirm that database migrations completed during the latest deployment.
6. Sign in to Serial directly and finish the initial instance setup.
7. For a custom extension build, register the value returned by `browser.identity.getRedirectURL()`.

Do not bypass certificate warnings or disable TLS verification to make extension authentication work. Fix the certificate trust or proxy configuration instead.
