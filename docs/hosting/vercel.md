# Hosting Serial on Vercel

1. Fork the `hfellerhoff/serial` respository to your own GitHub account.
2. Login to [Vercel](https://vercel.com/) and follow the onboarding to link your GitHub account.
3. Choose the `serial` repository and hit deploy. Your initial deployment will fail – that's okay.
4. Within your project, navigate to `Settings > Domains`. You have a few options for project domains:
	1. You can copy the provided domain as is
	2. You can update the provided domain with a new name
	3. You can link an existing domain
5. Create a new database on [Turso](https://turso.tech/)
	1. Sign up for an account if you don't have one, and navigate to the database dashboard
	2. Create a new database
	3. In the top right dropdown menu, click "Create Token" 
	4. Create a token with read and write permissions
	5. On the success screen, save the top value as `DATABASE_AUTH_TOKEN` and the bottom as `DATABASE_URL` in your environment variables.
6. Navigate to [Better Auth](https://www.better-auth.com/docs/installation#set-environment-variables) and generate an auth secret. Set this as `BETTER_AUTH_SECRET` in your environment variables.
7. That's it! Head on over to `Deployments` in the top navigation bar, choose `Create Deployment` in the top right menu, and head on over to your project URL once it's done!

If you'd like to support additional features, [see this section](https://github.com/hfellerhoff/serial#enabling-additional-features)!
