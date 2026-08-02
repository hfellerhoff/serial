import { eq } from "drizzle-orm";
import { readExtensionBearerToken } from "~/lib/extension-auth";
import { findExtensionSession } from "~/server/auth/extension";
import { db } from "~/server/db";
import { user } from "~/server/db/schema";

export async function authenticatedExtensionUser(request: Request) {
  const token = readExtensionBearerToken(request);
  if (!token) return null;
  const session = await findExtensionSession(token);
  if (!session) return null;
  const storedUser = await db.query.user.findFirst({
    where: eq(user.id, session.userId),
  });
  if (!storedUser) return null;
  const activeBan =
    storedUser.banned &&
    (!storedUser.banExpires || storedUser.banExpires.getTime() > Date.now());
  return activeBan ? null : storedUser;
}
