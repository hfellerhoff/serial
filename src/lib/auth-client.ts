import { createAuthClient } from "better-auth/react";
import { env } from "~/env";

export const authClient = createAuthClient({
  baseURL: env.BETTER_AUTH_URL,
});

export const { signIn, signOut, signUp, useSession, resetPassword } =
  authClient;
