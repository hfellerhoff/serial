import { createAuthClient } from "better-auth/react";
import {
  adminClient,
  emailOTPClient,
  genericOAuthClient,
} from "better-auth/client/plugins";
import { polarClient } from "@polar-sh/better-auth/client";

const plugins = [
  adminClient(),
  polarClient(),
  emailOTPClient(),
  genericOAuthClient(),
];

export const authClient = createAuthClient({
  plugins,
});

export const { signIn, signOut, signUp, useSession, resetPassword } =
  authClient;
