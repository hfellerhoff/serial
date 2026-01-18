# Hosting Serial on Coolify

1. Fork the `hfellerhoff/serial` respository to your own GitHub account.
2. If you don't have a [Coolify](https://coolify.io/) instance set up:
    1. Set up a locally hosted server, or purchase a VPS.
        - The cheapest option (that I know of in January 2026) is through Hetzner, where a VPS based in Germany or Finland will be around $4 a month. An `x86` architecure is recommended, but not required.
    2. SSH into your server, then complete the very short [installation steps](https://coolify.io/docs/get-started/installation).
    3. Access your Coolify UI and you should be ready for the next step!
3. Create or pick a project for Serial to live in.
4. Create a new resource, then choose `Private Repository (with GitHub App)`. Follow the steps to link your GitHub account if you haven't already done this.
5. Choose the server to deploy Serial on.
5. Choose "serial" from the available repositories.
6. Update `Build Pack` to be `Docker Compose`
    - IMPORTANT: If you have an ARM-based VPS, update your `Docker Compose Location` to be `/docker-compose.arm.yaml`. This is marginally less supported than x86 architectures, but should still work.
7. Update your domain in `Domains for server`:
    - If you don't have a custom domain, click `Generate domain`
    - Otherwise, add your custom domain (e.g. `https://example.com`)
8. Navigate to `Environment Variables` and update your `BETTER_AUTH_SECRET`
    - You can generate one in [this section of the Better Auth documentation](https://www.better-auth.com/docs/installation#set-environment-variables)
9. Set up your database
    - If you want to use a local libsql database, no changes are needed
    - If you want to use a cloud libsql database provider (like [Turso](https://turso.tech/)), set up a database with them and add your `DATABASE_AUTH_TOKEN` and `DATABASE_URL` to your environment variables.
10. Click deploy and wait for your app to be ready! You'll be able to access it once Coolify says it's "Healthy" at the domain you set up earlier.

If you'd like to support additional features, [see this section](https://github.com/hfellerhoff/serial#enabling-additional-features)!
