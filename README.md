![Preview of different feeds](/public/masonry-preview.png)

# Serial

A snappy, customizable video feed. Designed to show you exactly the content you want to see and nothing else.

[Check it out →](https://serial.tube/welcome)


## Local Development

> Note: Local development is only possible through the `libsql` host [Turso](https://turso.tech/) at the moment. This will change going forward, but keep in mind that your current database choices may be limited.

Getting up and running with Serial is easy. Here are the steps you need to start developing locally:

1. Clone the repository locally
2. Duplicate the `.env.example` file, and rename the copy to `.env`
3. Create a new database on  [Turso](https://turso.tech/)
	1. Sign up for an account if you don't have one, and navigate to the database dashboard
	2. Create a new database
	3. In the top right dropdown menu, click "Create Token" 
	4. Create a token with read and write permissions
	5. On the success screen, save the top value as `DATABASE_AUTH_TOKEN` and the bottom as `DATABASE_URL`
4. Navigate to [Better Auth](https://www.better-auth.com/docs/installation#set-environment-variables) and generate an auth secret. Set this as `BETTER_AUTH_SECRET`
5. (optional) Create an account on [Sendgrid](https://sendgrid.com/en-us) and set up a mailing address.
	- This is not necessary to get up and running, but is needed if you'd like working password reset and other email-related functionality.
6. Install your packages with `pnpm`
	1. If you don't have it already, install [pnpm](https://pnpm.io/)
	2. Run `pnpm i` to install packages
7. That's it! Run `pnpm dev` to migrate your database for the first time and boot up the development server.

## Self Hosting

> Note: Self hosting is only possible through the `libsql` host [Turso](https://turso.tech/) at the moment. This will change going forward, but keep in mind that your current database choices may be limited.

Self hosting Serial is relatively easy. I'll use the platform [Vercel](https://vercel.com/) here as an example (since it's easy to deploy Next.js applications there) but many platforms should work.

If you'd like a deployment target with more ownership that's still relatively easy to use, I would recommend [Coolify](https://coolify.io/). I use it to run the main Serial instance.

On  [Vercel](https://vercel.com/), follow these steps:
1. Fork the `hfellerhoff/serial` respository to your own GitHub account.
2. Login to [Vercel](https://vercel.com/) and follow the onboarding to link your GitHub account.
3. Choose the `serial` repository and hit deploy. Your initial deployment will fail – that's okay.
4. Within your project, navigate to `Settings > Domains`. You have a few options for project domains:
	1. You can copy the provided domain as is
	2. You can update the provided domain with a new name
	3. You can link an existing domain
5. Whichever domain you choose, copy that name and head down to `Environment Variables`. Add that domain value as `NEXT_PUBLIC_ROOT_URL`, being sure to include the protocol (`https://`)
6. Create a new database on  [Turso](https://turso.tech/)
	1. Sign up for an account if you don't have one, and navigate to the database dashboard
	2. Create a new database
	3. In the top right dropdown menu, click "Create Token" 
	4. Create a token with read and write permissions
	5. On the success screen, save the top value as `DATABASE_AUTH_TOKEN` and the bottom as `DATABASE_URL` in your environment variables.
7. Navigate to [Better Auth](https://www.better-auth.com/docs/installation#set-environment-variables) and generate an auth secret. Set this as `BETTER_AUTH_SECRET` in your environment variables.
8. (optional) Create an account on [Sendgrid](https://sendgrid.com/en-us) and set up a mailing address.
	- This is not necessary to get up and running, but is needed if you'd like working password reset and other email-related functionality.
9. That's it! Head on over to `Deployments` in the top navigation bar, choose `Create Deployment` in the top right menu, and head on over to your project URL once it's done!