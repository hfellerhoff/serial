import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangleIcon } from "lucide-react";

export const Route = createFileRoute("/maintenance")({
  component: RouteComponent,
});

function RouteComponent() {
  const supportEmail = import.meta.env.VITE_PUBLIC_SUPPORT_EMAIL_ADDRESS;

  return (
    <main className="bg-background text-pretty">
      <div className="h-screen w-screen bg-yellow-400 p-8">
        <div className="grid h-full w-full place-items-center pt-12 pb-16 md:pt-24 md:pb-32">
          <section className="border-foreground bg-background mx-auto flex max-w-2xl flex-col items-center justify-center gap-6 rounded-2xl border-8 px-6 py-16 text-center shadow-lg">
            <AlertTriangleIcon size={48} />
            <h1 className="text-3xl font-bold text-balance md:text-4xl">
              Instance Unavailable
            </h1>
            <p className="text-lg text-pretty md:text-xl">
              This instance is currently undergoing maintenance.
              {supportEmail && (
                <span>
                  {" "}
                  If you have any questions, please reach out to{" "}
                  <a href={`mailto:${supportEmail}`} className="underline">
                    {supportEmail}
                  </a>
                </span>
              )}
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
