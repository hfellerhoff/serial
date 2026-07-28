# Hosting Serial on Vercel

> Note: Only cloud database hosting is available on Vercel deployments.

1. Fork the `megaflorasoftware/serial` repository to your own GitHub account.
2. Login to [Vercel](https://vercel.com/) and follow the onboarding to link your GitHub account.
3. Import the `serial` repository. Before deploying, edit the project's **Root Directory** and select `apps/app`, then hit deploy. Your initial deployment will fail until the required environment variables are configured—that's okay.
4. Within your project, navigate to `Settings > Domains`. You have a few options for project domains:
   1. You can copy the provided domain as is
   2. You can update the provided domain with a new name
   3. You can link an existing domain
5. In `Settings > Environment Variables`, add the required application variables:
   1. Set `PUBLIC_BASE_URL` to the project origin you chose in step 4, including the protocol (for example, `https://serial.example.com`).
   2. Navigate to [Better Auth](https://www.better-auth.com/docs/installation#set-environment-variables), generate an auth secret, and set it as `BETTER_AUTH_SECRET`.
6. Create a new database on [Turso](https://turso.tech/)
   1. Sign up for an account if you don't have one, and navigate to the database dashboard
   2. Create a new database
   3. In the top right dropdown menu, click "Create Token"
   4. Create a token with read and write permissions
   5. On the success screen, save the top value as `DATABASE_AUTH_TOKEN` and the bottom as `DATABASE_URL` in your environment variables.
7. Head to `Deployments`, choose `Create Deployment`, and open your project URL when the deployment finishes.

## Upgrading an existing Vercel deployment

If the project was created before Serial moved to a monorepo, open `Settings > Build and Deployment`, set **Root Directory** to `apps/app`, save the change, and redeploy. Vercel will detect the surrounding pnpm workspace and install the app's workspace dependencies. Serial requires Node.js 22.12 or newer.

If you'd like to support additional features, [see this section](https://github.com/megaflorasoftware/serial#enabling-additional-features)!
