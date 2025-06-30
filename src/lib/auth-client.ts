import { createAuthClient } from "better-auth/react";
import { env } from "~/env";

export const authClient = createAuthClient({});

export const { signIn, signOut, signUp, useSession, resetPassword } =
  authClient;
