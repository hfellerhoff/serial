![Preview of different feeds](apps/app/public/og-image.png)

# Serial

A calm, customizable, and non-algorithmic RSS reader. Lots of
customization options and great support for video content. Fully
open source and easily self-hostable.

[Check it out →](https://serial.tube)

## Releases & Changelog

All release notes can be found at [https://serial.tube/releases](https://serial.tube/releases).

## Local Development

Getting up and running with Serial is easy. Here are the steps you need to start developing locally:

1. Clone the repository locally
2. Install the Turso CLI: https://github.com/tursodatabase/turso-cli
3. Copy `apps/app/.env.example` to `apps/app/.env`
4. Set `PUBLIC_BASE_URL` to `http://localhost:3000`
5. Navigate to [Better Auth](https://www.better-auth.com/docs/installation#set-environment-variables) and generate an auth secret. Set it as `BETTER_AUTH_SECRET`
6. Install [pnpm](https://pnpm.io/) if you don't have it already
7. Run `pnpm i` to install packages
8. Run `pnpm dev` to create, migrate, and run your database for the first time, then boot up the development server.

If you'd like to support additional features in development, [see below!](#enabling-additional-features)

## Self Hosting

Self hosting Serial is relatively easy. Here are the current platform-specific guides:

- [Coolify](/docs/hosting/coolify.md) (supports local and cloud db)
- [Vercel](/docs/hosting/vercel.md) (supports only cloud db)

If your preferred platform doesn't have a guide, follow these rough steps:

1. Fork the `megaflorasoftware/serial` repository to your own GitHub account.
2. Use a git-based deployment system to deploy when a new commit happens. This will make it easy to keep your deployment up to date.
3. Set up a custom domain (if desired)
4. Set up your database:
   - If you want to use a local libsql database, use the provided `docker-compose.yaml` configuration. The database requires no additional configuration, but the application variables below are still required.
     - It's less common, but you can also manually provide your local libsql server URL in `DATABASE_URL`.
   - If you want to use a cloud libsql database provider (like [Turso](https://turso.tech/)), set up a database with them and add your `DATABASE_AUTH_TOKEN` and `DATABASE_URL` to your environment variables.
5. Set `PUBLIC_BASE_URL` to the public origin URL where Serial will be available, such as `https://serial.example.com`.
6. Navigate to [Better Auth](https://www.better-auth.com/docs/installation#set-environment-variables) and generate an auth secret. Set this as `BETTER_AUTH_SECRET` in your environment variables.
7. Deploy your application. Docker images read public configuration when the container starts, so the same image can be used at different domains without rebuilding it.
8. To update Serial in the future, sync your forked code from the main repo and the app will redeploy.

If you'd like to support additional features, [see below!](#enabling-additional-features)

## Enabling additional features

Serial takes a model of progressive enhancement for features. The app can run with very few external dependencies, but services can be enabled whenever you want for whatever you need for your specific instance.

### Email support (for password reset, etc)

Serial supports [Resend](https://resend.com) and [SendGrid](https://sendgrid.com/en-us) as email providers. Only one is used at a time — if both keys are set, Resend takes priority.

- **Resend**: Create an account, add your `RESEND_API_KEY` to `.env` or your host's environment variables UI.
- **SendGrid**: Create an account, set up a mailing address, add your `SENDGRID_API_KEY` to `.env` or your host's environment variables UI.

### Instapaper integration

- Register a new Instapaper OAuth application using [their form](https://www.instapaper.com/main/request_oauth_consumer_token).
- Wait to receive your OAuth credentials
- Add your `INSTAPAPER_OAUTH_ID` and `INSTAPAPER_OAUTH_SECRET` to `.env` or your host's environment variables UI.
