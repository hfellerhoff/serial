import { createAuthClient } from "better-auth/react";
import {
  adminClient,
  emailOTPClient,
  genericOAuthClient,
} from "better-auth/client/plugins";
import { polarClient } from "@polar-sh/better-auth/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { getPublicConfigKey } from "~/lib/public-config";

const plugins = [
  adminClient(),
  polarClient(),
  emailOTPClient(),
  genericOAuthClient(),
  oauthProviderClient(),
];

export const authClient = createAuthClient({
  plugins,
  baseURL:
    typeof window !== "undefined"
      ? window.location.origin
      : getPublicConfigKey("PUBLIC_BASE_URL"),
});

export const { signIn, signOut, signUp, useSession } = authClient;
