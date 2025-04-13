![Preview of different feeds](/public/masonry-preview.png)

# Serial

A snappy, customizable video feed. Designed to show you exactly the content you want to see and nothing else.

[Check it out →](https://serial.tube/welcome)


## Local Development

> Note: Local development is only possible through the `libsql` host [Turso](https://turso.tech/) at the moment. This will change going forward, but keep in mind that your database choices may be limited.

Getting up and running with Serial is easy. Here are the steps you need to start developing locally:

1. Clone the repository locally
2. Duplicate the `.env.example` file, and rename the copy to `.env`
3. Create a new database on  [Turso](https://turso.tech/)
	1. In the top right dropdown menu, click "Create Token" 
	2. Create a token with read and write permissions
	3. On the success screen, save the top value as `DATABASE_AUTH_TOKEN` and the bottom as `DATABASE_URL`
4. Navigate to [Better Auth](https://www.better-auth.com/docs/installation#set-environment-variables) and generate an auth secret. Set this as `BETTER_AUTH_SECRET`
5. (optional) Create an account on [Sendgrid](https://sendgrid.com/en-us) and set up a mailing address.
	- This is not necessary to get up and running, but is needed if you'd like working password reset and other email-related functionality.
6. Install your packages with `pnpm`
	1. If you don't have it already, install [pnpm](https://pnpm.io/)
	2. Run `pnpm i` to install packages
7. That's it! Run `pnpm dev` to migrate your database for the first time and boot up the development server.

## Self Hosting

> Guide coming soon!