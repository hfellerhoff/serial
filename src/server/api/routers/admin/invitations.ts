import { randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
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

function getInviteUrl(token: string) {
  return `${env.VITE_PUBLIC_BASE_URL}/auth/sign-up?token=${token}`;
}

// Create an invitation link
export const createInvitation = adminProcedure
  .input(
    z.object({
      name: z.string().trim().nullable().optional(),
      maxUses: z.number().int().positive().nullable(),
      expiresAt: z.coerce.date().nullable(),
    }),
  )
  .handler(async ({ context, input }) => {
    const token = randomBytes(32).toString("base64url");

    const [created] = await db
      .insert(invitation)
      .values({
        token,
        inviterId: context.user.id,
        status: "active",
        name: input.name ?? null,
        maxUses: input.maxUses,
        expiresAt: input.expiresAt,
      })
      .returning();

    if (!created) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to create invitation",
      });
    }

    const inviteUrl = getInviteUrl(created.token);

    return { id: created.id, inviteUrl };
  });

// List all invitations
export const listInvitations = adminProcedure.handler(async () => {
  const rows = await db
    .select({
      id: invitation.id,
      name: invitation.name,
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
    inviteUrl: getInviteUrl(token),
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

    const inviteUrl = getInviteUrl(inv.token);

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

// Update an invitation's details
export const updateInvitation = adminProcedure
  .input(
    z.object({
      invitationId: z.string(),
      name: z.string().trim().nullable(),
      maxUses: z.number().int().positive().nullable(),
      expiresAt: z.coerce.date().nullable(),
    }),
  )
  .handler(async ({ input }) => {
    const inv = await db
      .select({ id: invitation.id })
      .from(invitation)
      .where(eq(invitation.id, input.invitationId))
      .get();

    if (!inv) {
      throw new ORPCError("NOT_FOUND", { message: "Invitation not found" });
    }

    await db
      .update(invitation)
      .set({
        name: input.name,
        maxUses: input.maxUses,
        expiresAt: input.expiresAt,
      })
      .where(eq(invitation.id, input.invitationId));

    return { updated: true };
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
