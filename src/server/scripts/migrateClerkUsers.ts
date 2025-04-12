import "dotenv/config";
import { createClerkClient } from "@clerk/backend";
import { randomUUID } from "node:crypto";

import * as schema from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { db } from "../db";

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

async function migrate() {
  const users = await clerkClient.users.getUserList({
    limit: 500,
  });

  let usersAdded = 0;

  await db.transaction(async (tx) => {
    return await Promise.all(
      users.data.map(async (user) => {
        const users = await tx
          .select()
          .from(schema.user)
          .where(eq(schema.user.id, user.id!));

        if (users.length > 0) {
          return;
        }

        await tx
          .insert(schema.user)
          .values({
            id: user.id!,
            name: user.firstName || user.fullName || "",
            email: user.primaryEmailAddress?.emailAddress!,
            emailVerified: false,
            createdAt: new Date(user.createdAt),
            updatedAt: new Date(user.updatedAt),
          })
          .onConflictDoNothing();

        await tx.insert(schema.account).values({
          id: randomUUID(),
          accountId: user.id!,
          providerId: "credential",
          userId: user.id!,
          accessToken: null,
          createdAt: new Date(user.createdAt),
          updatedAt: new Date(user.updatedAt),
        });
        usersAdded += 1;
      }),
    );
  });

  console.log(`Previous Clerk users considered: ${users.data.length}`);
  console.log(`Previous Clerk users migrated: ${usersAdded}`);
}

migrate();
