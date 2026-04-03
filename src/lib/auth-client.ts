import { createAuthClient } from "better-auth/react";
import { adminClient, emailOTPClient } from "better-auth/client/plugins";
import { polarClient } from "@polar-sh/better-auth/client";

const plugins = [adminClient(), polarClient(), emailOTPClient()];

export const authClient = createAuthClient({
  plugins,
});

export const { signIn, signOut, signUp, useSession, resetPassword } =
  authClient;
