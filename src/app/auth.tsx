import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { env } from "~/env";
import { BASE_SIGNED_OUT_URL, IS_MAIN_INSTANCE } from "~/lib/constants";
import { authMiddleware } from "~/server/auth";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  beforeLoad: () => {
    console.log(env.VITE_PUBLIC_IS_MAINTENANCE_MODE);
    if (env.VITE_PUBLIC_IS_MAINTENANCE_MODE === "true") {
      throw redirect({
        to: "/maintenance",
      });
    }
  },
  server: {
    middleware: [authMiddleware],
  },
});

function AuthPage() {
  return (
    <>
      {IS_MAIN_INSTANCE && (
        <div className="p-4 md:p-8">
          <Link to={BASE_SIGNED_OUT_URL} className="hover:bg-transparent">
            <Button variant="outline">⭠ Back to Home</Button>
          </Link>
        </div>
      )}
      <div className="pointer-events-none fixed inset-0 grid h-screen w-screen place-items-center p-4">
        <Card className="pointer-events-auto w-full max-w-md">
          <Outlet />
        </Card>
      </div>
    </>
  );
}
