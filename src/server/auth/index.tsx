import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import { headers as getNextHeaders } from "next/headers";
import sendgrid from "@sendgrid/mail";
import { render } from "@react-email/components";
import ResetPasswordEmail from "~/emails/reset-password";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
    maxPasswordLength: 64,
    async sendResetPassword(data, request) {
      sendgrid.setApiKey(process.env.SENDGRID_API_KEY ?? "");

      const forgotPasswordEmailHtml = await render(
        <ResetPasswordEmail resetUrl={data.url} />,
      );

      const options = {
        from: "hey@serial.tube",
        to: data.user.email,
        subject: "Reset your password for Serial",
        html: forgotPasswordEmailHtml,
      };

      await sendgrid.send(options);
    },
  },

  /** if no database is provided, the user data will be stored in memory.
   * Make sure to provide a database to persist user data **/
});

export async function getServerAuth() {
  const headers = await getNextHeaders();
  return await auth.api.getSession({
    headers,
  });
}

export async function isServerAuthed() {
  const headers = await getNextHeaders();
  const authResult = await auth.api.getSession({
    headers,
  });

  return !!authResult?.session.id && !!authResult?.user.id;
}
