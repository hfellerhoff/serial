import { Resend } from "resend";
import sendgrid from "@sendgrid/mail";
import { env } from "~/env";

type EmailProvider = "resend" | "sendgrid";

export const EMAIL_PROVIDER: EmailProvider | null = env.RESEND_API_KEY
  ? "resend"
  : env.SENDGRID_API_KEY
    ? "sendgrid"
    : null;

export const IS_EMAIL_ENABLED =
  EMAIL_PROVIDER !== null && !!env.FROM_EMAIL_ADDRESS;

export function isEmailProvider(
  provider: EmailProvider,
): provider is EmailProvider {
  return EMAIL_PROVIDER === provider;
}

// Module-level singletons — avoids recreating SDK clients on every send
const resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

if (env.SENDGRID_API_KEY) {
  sendgrid.setApiKey(env.SENDGRID_API_KEY);
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(opts: SendEmailOptions) {
  if (!IS_EMAIL_ENABLED) {
    throw new Error("Email sending is not configured");
  }

  const fullOpts = { ...opts, from: env.FROM_EMAIL_ADDRESS! };

  if (isEmailProvider("resend")) {
    await resendClient!.emails.send(fullOpts);
  } else if (isEmailProvider("sendgrid")) {
    await sendgrid.send(fullOpts);
  }
}
