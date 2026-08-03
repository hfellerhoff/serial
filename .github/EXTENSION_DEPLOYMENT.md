# Browser extension deployment

`deploy-extension.yml` builds and submits Chrome and Firefox updates after an
affected push reaches `main`. Store reviews remain asynchronous; accepted
updates publish automatically. A manual workflow dispatch forces a release.

The workflow uses a UTC calendar manifest version with four Chrome-compatible
integer components:

```text
year.day-of-year.hour.second-within-hour
```

For example, `2026.215.14.1832` represents 2026 day 215 at 14:30:32 UTC. Local
builds continue to use the version in `apps/extension/package.json`.

## One-time listing bootstrap

Do not merge this workflow to `main` until both listings and every repository
setting below exist.

### Chrome Web Store

1. Build the manual packages from the approved `beta` commit:

   ```sh
   pnpm --filter @serial/extension zip:stores
   ```

2. In the Chrome Web Store Developer Dashboard, add a new item and upload
   `apps/extension/.output/*-chrome.zip`. Save it as a draft; do not submit it
   for review yet. The store ZIP intentionally omits the development-only
   manifest `key`; the dashboard assigns the listing identity.
3. Record the item ID. On the Package tab, choose **View public key** and copy
   the base64 text between the PEM markers as one line.
4. Replace `CHROME_EXTENSION_MANIFEST_KEY` and its derived
   `CHROME_EXTENSION_ID` in `packages/extension-identity/src/index.ts`. Run the
   identity tests and a local Chrome build. Its unpacked extension ID must match
   the dashboard item ID. Rebuild the store packages separately; they continue
   to omit the manifest `key`.
5. Upload the rebuilt package to the same draft. Complete the Store listing,
   Privacy, Distribution, and Test instructions tabs. The privacy declarations
   must match `apps/extension/README.md` and the actual permission/data flow.
6. Manually submit and publish the initial public version. Chrome API v2 keeps
   the existing visibility, so the public visibility must be established once
   in the dashboard before CI can publish updates.

Chrome's official identity instructions are at
<https://developer.chrome.com/docs/extensions/reference/manifest/key>. Chrome's
API setup is documented at
<https://developer.chrome.com/docs/webstore/service-accounts>.

### Firefox Add-ons

1. Upload `apps/extension/.output/*-firefox.zip` to AMO as a listed add-on with
   ID `serial@megaflora.net`. Include
   `apps/extension/.output/*-sources.zip` when AMO requests source code.
2. Complete the listing, privacy/data-collection declarations, reviewer notes,
   and initial review. Publish the first listed version.
3. Create AMO API credentials from the developer credentials page. Store the
   issuer and secret only in GitHub Actions secrets.

Mozilla's API credential instructions are at
<https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/#obtain-an-api-key>.

## Keyless Chrome authentication

Create a Google Cloud project, enable the Chrome Web Store API, and create a
service account. Add that service-account email under the Chrome Web Store
Developer Dashboard's Account section. Chrome currently permits one service
account per publisher.

Create a GitHub OIDC Workload Identity pool/provider with these restrictions:

- issuer: `https://token.actions.githubusercontent.com`
- repository: `megaflorasoftware/serial`
- ref: `refs/heads/main`
- mapped repository attribute used in the service-account IAM binding

Grant the repository principal
`roles/iam.workloadIdentityUser` on the service account. Do not create or export
a service-account JSON key. The workflow requests only the
`https://www.googleapis.com/auth/chromewebstore` OAuth scope.

The maintained GitHub authentication action documents the exact Workload
Identity commands at <https://github.com/google-github-actions/auth>.

## GitHub repository configuration

Create these Actions repository variables:

| Variable                            | Value                                                                |
| ----------------------------------- | -------------------------------------------------------------------- |
| `CHROME_EXTENSION_ID`               | Chrome dashboard item ID; must match `CHROME_EXTENSION_ID` in source |
| `CHROME_PUBLISHER_ID`               | Publisher ID from Chrome dashboard Settings                          |
| `CHROME_SERVICE_ACCOUNT`            | Google service-account email added to Chrome Web Store               |
| `CHROME_WORKLOAD_IDENTITY_PROVIDER` | Full `projects/.../providers/...` provider resource name             |
| `FIREFOX_EXTENSION_ID`              | `serial@megaflora.net`                                               |

Create these Actions repository secrets:

| Secret               | Value                  |
| -------------------- | ---------------------- |
| `FIREFOX_JWT_ISSUER` | AMO JWT issuer/API key |
| `FIREFOX_JWT_SECRET` | AMO JWT secret         |

## Release behavior

The affected check follows Turbo's dependency graph. Changes to the extension,
its transitive workspace packages, repository build inputs, lockfile, or this
deployment workflow/scripts trigger a release. Unrelated app and website changes
do not.

Chrome and Firefox share one release version and one readiness gate. If either
store has a revision under review—or Chrome has one staged for publication—the
workflow stops before building or uploading either package. It never cancels an
active review. After both stores are ready, rerun the failed workflow. Store
warnings block Chrome submission so a maintainer can resolve them in the
Developer Dashboard instead of silently publishing through a changed review
condition.

The two store submissions are independent API calls after the shared gate. If
exactly one deployment job fails, rerun only that failed job from the same
workflow run. It reuses the retained package and shared version without
replacing the successful store's active review. Do not dispatch a new release
to recover a partial submission.
