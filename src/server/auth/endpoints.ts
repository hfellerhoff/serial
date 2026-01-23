import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { auth, isServerAuthed } from ".";
import { env } from "~/env";

export const fetchIsForgotPasswordEnabled = createServerFn({
  method: "GET",
}).handler(async () => !!env.SENDGRID_API_KEY);

export const fetchIsAuthed = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest();
    return isServerAuthed(request.headers);
  },
);

export const fetchAdminUserById = createServerFn({ method: "GET" })
  .inputValidator((userId: string) => userId)
  .handler(async ({ data: userId }) => {
    const request = getRequest();
    const headers = request.headers;

    // Verify the caller is an admin
    const session = await auth.api.getSession({ headers });
    if (!session?.user || session.user.role !== "admin") {
      throw new Error("Unauthorized: Admin access required");
    }

    const sessionsResult = await auth.api.listUserSessions({
      headers,
      body: { userId },
    });

    const allUsers = await auth.api.listUsers({
      headers,
      query: {
        limit: 1000,
        offset: 0,
      },
    });

    const user = allUsers.users.find((u) => u.id === userId);

    if (!user) {
      throw new Error("User not found");
    }

    return {
      user,
      sessions: sessionsResult.sessions,
    };
  });
