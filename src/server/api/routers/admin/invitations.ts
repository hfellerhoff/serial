import { randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { getRequest } from "@tanstack/react-start/server";
import { createElement } from "react";
import { render } from "@react-email/components";
import { count, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "./base";
import InviteUserEmail from "~/emails/invite-user";
import { validateInvitationToken } from "~/server/invitations";
import { env } from "~/env";
import { invitation, invitationRedemption, user } from "~/server/db/schema";
import { db } from "~/server/db";
import { IS_EMAIL_ENABLED, sendEmail } from "~/server/email";

function getInviteUrl(token: string, origin?: string) {
  const baseUrl = origin || env.BETTER_AUTH_BASE_URL;
  return `${baseUrl}/auth/sign-up?token=${token}`;
}

function getOriginFromRequest(): string | undefined {
  try {
    const request = getRequest();
    const host = request.headers.get("host");
    if (host) {
      const isLocalhost =
        host.startsWith("localhost") || host.startsWith("127.0.0.1");
      const fallbackProtocol = isLocalhost ? "http" : "https";
      const protocol =
        request.headers.get("x-forwarded-proto") ?? fallbackProtocol;
      return `${protocol}://${host}`;
    }
    return new URL(request.url).origin;
  } catch {
    return undefined;
  }
}

// Create an invitation link
export const createInvitation = adminProcedure
  .input(
    z.object({
      maxUses: z.number().int().positive().nullable(),
      expiresAt: z.coerce.date().nullable(),
    }),
  )
  .handler(async ({ context, input }) => {
    const token = randomBytes(32).toString("base64url");
    const origin = getOriginFromRequest();

    const [created] = await db
      .insert(invitation)
      .values({
        token,
        inviterId: context.user.id,
        status: "active",
        maxUses: input.maxUses,
        expiresAt: input.expiresAt,
      })
      .returning();

    if (!created) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to create invitation",
      });
    }

    const inviteUrl = getInviteUrl(created.token, origin);

    return { id: created.id, inviteUrl };
  });

// List all invitations
export const listInvitations = adminProcedure.handler(async () => {
  const origin = getOriginFromRequest();
  const rows = await db
    .select({
      id: invitation.id,
      token: invitation.token,
      status: invitation.status,
      maxUses: invitation.maxUses,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      inviterName: user.name,
      useCount: count(invitationRedemption.id),
    })
    .from(invitation)
    .leftJoin(user, eq(invitation.inviterId, user.id))
    .leftJoin(
      invitationRedemption,
      eq(invitation.id, invitationRedemption.invitationId),
    )
    .groupBy(invitation.id)
    .orderBy(desc(invitation.createdAt))
    .all();

  const invitations = rows.map(({ token, ...rest }) => ({
    ...rest,
    inviteUrl: getInviteUrl(token, origin),
  }));

  return { invitations };
});

// Send an invitation email for an existing invitation
export const sendInvitationEmail = adminProcedure
  .input(z.object({ invitationId: z.string(), email: z.string().email() }))
  .handler(async ({ context, input }) => {
    if (!IS_EMAIL_ENABLED) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "Email sending is not configured. Configure an email provider to send invitations.",
      });
    }

    const existingUser = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, input.email))
      .get();

    if (existingUser) {
      throw new ORPCError("BAD_REQUEST", {
        message: "A user with this email already exists",
      });
    }

    // Look up the invitation by ID, then validate its token
    const inv = await db
      .select({ token: invitation.token })
      .from(invitation)
      .where(eq(invitation.id, input.invitationId))
      .get();

    if (!inv) {
      throw new ORPCError("NOT_FOUND", { message: "Invitation not found" });
    }

    const validated = await validateInvitationToken(inv.token);
    if (!validated) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "Invitation is no longer valid (expired, disabled, or exhausted)",
      });
    }

    const origin = getOriginFromRequest();
    const inviteUrl = getInviteUrl(inv.token, origin);

    const html = await render(
      createElement(InviteUserEmail, {
        inviteUrl,
        inviterName: context.user.name,
        supportEmail: env.VITE_PUBLIC_SUPPORT_EMAIL_ADDRESS,
      }),
    );

    await sendEmail({
      to: input.email,
      subject: "You've been invited to Serial",
      html,
    });

    return { sent: true };
  });

// Delete an invitation
export const deleteInvitation = adminProcedure
  .input(z.object({ invitationId: z.string() }))
  .handler(async ({ input }) => {
    const inv = await db
      .select({ id: invitation.id })
      .from(invitation)
      .where(eq(invitation.id, input.invitationId))
      .get();

    if (!inv) {
      throw new ORPCError("NOT_FOUND", { message: "Invitation not found" });
    }

    await db.delete(invitation).where(eq(invitation.id, input.invitationId));

    return { deleted: true };
  });
