import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { authMiddleware } from "~/server/auth";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  server: {
    middleware: [authMiddleware],
  },
});

function AuthPage() {
  return (
    <>
      <div className="p-4 md:p-8">
        <Link to="/welcome" className="hover:bg-transparent">
          <Button variant="outline">⭠ Back to Home</Button>
        </Link>
      </div>
      <div className="pointer-events-none fixed inset-0 grid h-screen w-screen place-items-center p-4">
        <Card className="pointer-events-auto w-full max-w-md">
          <Outlet />
        </Card>
      </div>
    </>
  );
}
