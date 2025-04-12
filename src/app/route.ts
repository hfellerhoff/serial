import { redirect } from "next/navigation";
import { getServerAuth } from "~/server/auth";
import {
  AUTH_SIGNED_IN_URL,
  AUTH_SIGNED_OUT_URL,
} from "~/server/auth/constants";

export async function GET() {
  const auth = await getServerAuth();

  if (auth?.session.id) {
    return redirect(AUTH_SIGNED_IN_URL);
  }

  return redirect(AUTH_SIGNED_OUT_URL);
}
