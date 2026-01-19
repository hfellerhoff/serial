# Hosting Serial on Coolify

## Deploy using Public Repository (easiest)
1. If you don't have a [Coolify](https://coolify.io/) instance set up:
   1. Set up a locally hosted server, or purchase a VPS.
      - The cheapest option (that I know of in January 2026) is through Hetzner, where a VPS based in Germany or Finland will be around $4 a month. An `x86` architecure is recommended, but not required.
   2. SSH into your server, then complete the very short [installation steps](https://coolify.io/docs/get-started/installation).
   3. Access your Coolify UI and you should be ready for the next step!
2. Create or pick a project for Serial to live in.
3. Create a new resource, then choose `Public Repository`.
4. Choose the server to deploy Serial on. If you run Coolify on a single VPS, this will be `localhost`.
5. For the repository, enter `https://github.com/hfellerhoff/serial`.
6. Update `Build Pack` to be `Docker Compose` and choose a compose file:
   - Use `docker-compose.yaml` to use a local DB on an x86 architecture (default)
   - Use `docker-compose.arm.yaml` to use a local DB on an ARM architecture
   - Use `docker-compose.cloud.yaml` to use a cloud DB on any architecture
   - *Note: If you want your version of Serial to be the absolute newest and have an auto-sync plugin on your repo, you can opt for `docker-compose.build.yaml`, `docker-compose.build-arm.yaml`, or `docker-compose.build-cloud.yaml` to build your own image instead of relying on the container registry image.*
7. (optional) Customize your domain in `Domains for server`:
   - If you don't have a custom domain, click `Generate domain`
   - Otherwise, add your custom domain (e.g. `https://example.com`)
8. Navigate to `Environment Variables` and update your `BETTER_AUTH_SECRET`
   - You can generate one in [this section of the Better Auth documentation](https://www.better-auth.com/docs/installation#set-environment-variables)
9. If using a cloud database, set up your database
    - If you want to use a cloud libsql database provider (like [Turso](https://turso.tech/)), set up a database with them and add your `DATABASE_AUTH_TOKEN` and `DATABASE_URL` to your environment variables.
10. Click deploy and wait for your app to be ready! You'll be able to access it once Coolify says it's running.
11. Access your domain through the domain you added or through the provided links in the `Links` header item.

## Deploy using Docker Compose file
1. If you don't have a [Coolify](https://coolify.io/) instance set up:
   1. Set up a locally hosted server, or purchase a VPS.
      - The cheapest option (that I know of in January 2026) is through Hetzner, where a VPS based in Germany or Finland will be around $4 a month. An `x86` architecure is recommended, but not required.
   2. SSH into your server, then complete the very short [installation steps](https://coolify.io/docs/get-started/installation).
   3. Access your Coolify UI and you should be ready for the next step!
2. Create or pick a project for Serial to live in.
3. Create a new resource, then choose `Docker Compose Empty`.
4. Choose the server to deploy Serial on. If you run Coolify on a single VPS, this will be `localhost`.
5. Determine the best Serial docker compose file for your needs:
   - Use [`docker-compose.yaml`](https://raw.githubusercontent.com/hfellerhoff/serial/refs/heads/main/docker-compose.yaml) to use a local DB on an x86 architecture (default)
   - Use [`docker-compose.arm.yaml`](https://raw.githubusercontent.com/hfellerhoff/serial/refs/heads/main/docker-compose.arm.yaml) to use a local DB on an ARM architecture
   - Use [`docker-compose.cloud.yaml`](https://raw.githubusercontent.com/hfellerhoff/serial/refs/heads/main/docker-compose.cloud.yaml) to use a cloud DB on any architecture
6. Paste the file content into Coolify
7. (optional) Add your custom domain:
   - Click `Settings` for the `Serial` service
   - Add your custom domain (e.g. `https://example.com`)
8. Navigate to `Environment Variables` and update your `BETTER_AUTH_SECRET`
   - You can generate one in [this section of the Better Auth documentation](https://www.better-auth.com/docs/installation#set-environment-variables)
9. If using a cloud database, set up your database
    - If you want to use a cloud libsql database provider (like [Turso](https://turso.tech/)), set up a database with them and add your `DATABASE_AUTH_TOKEN` and `DATABASE_URL` to your environment variables.
10. Click deploy and wait for your app to be ready! You'll be able to access it once Coolify says it's running.
11. Access your domain through the domain you added or through the provided links in the `Links` header item.

## Deploy using Private Repository (with GitHub App)
1. Fork the `hfellerhoff/serial` respository to your own GitHub account.
2. If you don't have a [Coolify](https://coolify.io/) instance set up:
   1. Set up a locally hosted server, or purchase a VPS.
      - The cheapest option (that I know of in January 2026) is through Hetzner, where a VPS based in Germany or Finland will be around $4 a month. An `x86` architecure is recommended, but not required.
   2. SSH into your server, then complete the very short [installation steps](https://coolify.io/docs/get-started/installation).
   3. Access your Coolify UI and you should be ready for the next step!
3. Create or pick a project for Serial to live in.
4. Create a new resource, then choose `Private Repository (with GitHub App)`. Follow the steps to link your GitHub account if you haven't already done this.
5. Choose the server to deploy Serial on.
6. Choose "serial" from the available repositories.
7. Update `Build Pack` to be `Docker Compose` and choose a compose file:
   - Use `docker-compose.yaml` to use a local DB on an x86 architecture (default)
   - Use `docker-compose.arm.yaml` to use a local DB on an ARM architecture
   - Use `docker-compose.cloud.yaml` to use a cloud DB on any architecture
   - *Note: If you want your version of Serial to be the absolute newest and have an auto-sync plugin on your repo, you can opt for `docker-compose.build.yaml`, `docker-compose.build-arm.yaml`, or `docker-compose.build-cloud.yaml` to build your own image instead of relying on the container registry image.*
8. (optional) Customize your domain in `Domains for server`:
   - If you don't have a custom domain, click `Generate domain`
   - Otherwise, add your custom domain (e.g. `https://example.com`)
9. Navigate to `Environment Variables` and update your `BETTER_AUTH_SECRET`
   - You can generate one in [this section of the Better Auth documentation](https://www.better-auth.com/docs/installation#set-environment-variables)
10. If using a cloud database, set up your database
    - If you want to use a cloud libsql database provider (like [Turso](https://turso.tech/)), set up a database with them and add your `DATABASE_AUTH_TOKEN` and `DATABASE_URL` to your environment variables.
11. Click deploy and wait for your app to be ready! You'll be able to access it once Coolify says it's running.
12. Access your domain through the domain you added or through the provided links in the `Links` header item.

If you'd like to support additional features, [see this section](https://github.com/hfellerhoff/serial#enabling-additional-features)!
