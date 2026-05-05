import { Link } from "@tanstack/react-router";
import { StarIcon } from "lucide-react";
import { Button } from "../ui/button";
import { AUTH_PAGE_URL } from "~/server/auth/constants";

export function WebsiteNavigation(props: { isAuthed: boolean }) {
  return (
    <header className="border-muted mx-auto max-w-4xl px-4 pt-4 lg:px-0 lg:pt-8">
      <nav className="flex items-center gap-1">
        <div className="flex flex-1 justify-start">
          <Link
            to="/welcome"
            className="hover:bg-muted flex items-center justify-center gap-2 rounded px-2 py-1 text-xl font-bold transition-all"
          >
            <img
              src="/favicon-32x32.png"
              className="mx-auto size-5 rounded"
              alt="Serial logo"
            />
            Serial
          </Link>
        </div>
        <div className="flex flex-none items-center gap-1">
          <Link
            to="/pricing"
            className="text-md text-muted-foreground hover:bg-muted block rounded px-2 py-1 font-semibold transition-all"
          >
            Pricing
          </Link>
          <Link
            to="/releases"
            className="text-md text-muted-foreground hover:bg-muted block rounded px-2 py-1 font-semibold transition-all"
          >
            Releases
          </Link>
          <Link
            to="/guides"
            className="text-md text-muted-foreground hover:bg-muted block rounded px-2 py-1 font-semibold transition-all"
          >
            Guides
          </Link>
        </div>
        <div className="hidden flex-1 items-center justify-end gap-2 md:flex">
          <a
            href="https://github.com/megaflorasoftware/serial"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              size="icon md:default"
              variant="outline"
              className="gap-1.5"
            >
              <StarIcon size={16} /> Star
            </Button>
          </a>
          {props.isAuthed ? (
            <Link to="/">
              <Button>Back To App</Button>
            </Link>
          ) : (
            <Link to={AUTH_PAGE_URL}>
              <Button>Get Started</Button>
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
