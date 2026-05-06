import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, ExternalLinkIcon } from "lucide-react";
import { Button } from "../ui/button";
import { AUTH_PAGE_URL } from "~/server/auth/constants";

export function WebFooterCTA() {
  const supportEmail = import.meta.env.VITE_PUBLIC_SUPPORT_EMAIL_ADDRESS;

  return (
    <>
      <div className="border-foreground mx-auto max-w-4xl border-4 border-x-0 border-dashed px-6 py-16 md:border-x-4">
        <section className="relative mx-auto max-w-xl text-center text-2xl text-pretty md:py-16 md:text-3xl">
          <p>Ready to take back control of your content?</p>
          <div className="mt-6 space-x-2">
            <Link to={AUTH_PAGE_URL}>
              <Button size="lg" className="text-base">
                Get Started
              </Button>
            </Link>
            <a
              href="https://demo.serial.tube"
              className="hover:bg-transparent"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="lg" className="gap-2 text-base">
                Try Demo <ExternalLinkIcon size={16} />
              </Button>
            </a>
          </div>
          <div className="mt-2">
            <a
              href="https://github.com/megaflorasoftware/serial?tab=readme-ov-file#self-hosting"
              className="hover:bg-transparent"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="link" size="lg" className="gap-2 text-base">
                Host your own instance <ArrowRightIcon size={16} />
              </Button>
            </a>
          </div>
        </section>
      </div>
      {supportEmail && (
        <section className="space-y-2 px-6 py-8 text-center md:py-16">
          <p className="text-lg">
            Have a question? Reach us at{" "}
            <a href={`mailto:${supportEmail}`} className="underline">
              {supportEmail}
            </a>
          </p>
        </section>
      )}
    </>
  );
}
