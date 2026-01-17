import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import z from "zod";
import { AuthHeader } from "~/components/auth/AuthHeader";
import { AuthResetPageComponent } from "~/components/auth/reset/AuthResetPageComponent";
import { fetchIsForgotPasswordEnabled } from "~/server/auth/endpoints";

const authSearchSchema = z.object({
  token: z.string().default(""),
  email: z.string().default(""),
});

export const Route = createFileRoute("/auth/reset")({
  component: AuthResetPage,
  loader: async () => {
    const isForgotPasswordEnabled = await fetchIsForgotPasswordEnabled();

    return { isForgotPasswordEnabled };
  },
  validateSearch: zodValidator(authSearchSchema),
});

export default function AuthResetPage() {
  const { isForgotPasswordEnabled } = Route.useLoaderData();

  if (!isForgotPasswordEnabled) {
    return (
      <>
        <AuthHeader>
          <p className="text-center font-semibold">Reset Password</p>
          <p className="mx-auto max-w-xs text-center">
            Resetting your password is unavailable at this time. Please contact
            your admin for more assistance.
          </p>
        </AuthHeader>
      </>
    );
  }

  return <AuthResetPageComponent />;
}
