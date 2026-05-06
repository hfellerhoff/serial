import { randomBytes } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { auth } from "~/server/auth";
import {
  checkDemoProvisionRateLimit,
  generateDemoEmail,
  setDemoProvisionRateLimit,
} from "~/server/demo";
import { IS_DEMO_INSTANCE } from "~/lib/demo";

export const Route = createFileRoute("/api/demo/provision")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!IS_DEMO_INSTANCE) {
          return new Response("Not Found", { status: 404 });
        }

        const session = await auth.api.getSession({
          headers: request.headers,
        });
        if (session) {
          return new Response(null, {
            status: 302,
            headers: { Location: "/" },
          });
        }

        const allowed = await checkDemoProvisionRateLimit();
        if (!allowed) {
          return new Response(
            `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Serial — Demo Rate Limit</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      background: #ffffff;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
      padding: 1.5rem;
    }
    .container { max-width: 28rem; }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
    p { color: #a3a3a3; line-height: 1.5; margin: 0; }
    a { color: black; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <img src='/icon-256.png' style="width: 4rem; height: 4rem; border-radius: 16px;" />
    <h1>Demo is at capacity</h1>
    <p>This demo instance is temporarily rate-limited to prevent abuse. Please try again in a moment.</p>
    <p style="margin-top: 1.5rem;"><a href="" onclick="location.reload();return false;">Try again</a></p>
  </div>
</body>
</html>`,
            {
              status: 429,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            },
          );
        }

        await setDemoProvisionRateLimit();

        const email = generateDemoEmail();
        const password = randomBytes(16).toString("hex");

        try {
          await auth.api.signUpEmail({
            body: {
              name: "Demo User",
              email,
              password,
            },
            headers: request.headers,
          });
        } catch (error) {
          console.error("[demo] Failed to provision user:", error);
          return new Response("Failed to create demo account", {
            status: 500,
          });
        }

        return new Response(null, {
          status: 302,
          headers: { Location: "/" },
        });
      },
    },
  },
});
