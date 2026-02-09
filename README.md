![Preview of different feeds](/public/masonry-preview.png)

# Serial

A snappy, customizable RSS reader specifically designed for video content. Designed to show you exactly the content you want to see and nothing else.

[Check it out →](https://serial.tube/welcome)

## Releases & Changelog

All release notes can be found at [https://serial.tube/releases](https://serial.tube/releases).

## Local Development

Getting up and running with Serial is easy. Here are the steps you need to start developing locally:

1. Clone the repository locally
2. Install the Turso CLI: https://github.com/tursodatabase/turso-cli
3. Duplicate the `.env.example` file, and rename the copy to `.env`
4. Navigate to [Better Auth](https://www.better-auth.com/docs/installation#set-environment-variables) and generate an auth secret. Set this as `BETTER_AUTH_SECRET`
5. Install [pnpm](https://pnpm.io/) if you don't have it already
6. Run `pnpm i` to install packages
7. Run `pnpm dev` to create, migrate, and run your database for the first time, then boot up the development server.

If you'd like to support additional features in development, [see below!](#enabling-additional-features)

## Self Hosting

Self hosting Serial is relatively easy. Here are the current step by step platform-specific guides available:

- [Coolify](/docs/hosting/coolify.md) (supports local and cloud db)
- [Vercel](/docs/hosting/vercel.md) (supports only cloud db)

If your preferred platform doesn't have a guide, follow these rough steps:

1. Fork the `hfellerhoff/serial` respository to your own GitHub account.
2. Use a git-based deployment system to deploy when a new commit happens. This will make it easy to keep your deploment up to date.
3. Set up a custom domain (if desired)
4. Set up your database:
   - If you want to use a local libsql database, use the provided `docker-compose.yaml` configuration. This should require no additional configuration or environment variables.
     - It's less common, but you can also manually provide your local libsql server URL in `DATABASE_URL`.
   - If you want to use a cloud libsql database provider (like [Turso](https://turso.tech/)), set up a database with them and add your `DATABASE_AUTH_TOKEN` and `DATABASE_URL` to your environment variables.
5. Navigate to [Better Auth](https://www.better-auth.com/docs/installation#set-environment-variables) and generate an auth secret. Set this as `BETTER_AUTH_SECRET` in your environment variables.
6. Deploy your application
7. To update Serial in the future, just sync your forked code from the main repo and the app will redeploy

If you'd like to support additional features, [see below!](#enabling-additional-features)

## Enabling additional features

Serial takes a model of progressive enhancement for features. The app can run with very few external dependencies, but services can be enabled whenever you want for whatever you need for your specific instance.

### Email support (for password reset, etc)

- Create an account on [Sendgrid](https://sendgrid.com/en-us)
- Set up a mailing address
- Add your `SENDGRID_API_KEY` to `.env` or your host's environment variables UI.

### Instapaper integration

- Register a new Instapaper OAuth application using [their form](https://www.instapaper.com/main/request_oauth_consumer_token).
- Wait to recieve your OAuth credentials
- Add your `INSTAPAPER_OAUTH_ID` and `INSTAPAPER_OAUTH_SECRET` to `.env` or your host's environment variables UI.
