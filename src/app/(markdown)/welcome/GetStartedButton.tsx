import Link from "next/link";
import { Button } from "~/components/ui/button";
import { AUTH_PAGE_URL } from "~/server/auth/constants";

export function GetStartedButton() {
  return (
    <div className="mt-4 mb-8 flex gap-2 md:mb-12">
      <Link href={AUTH_PAGE_URL} className="hover:bg-transparent">
        <Button>Get Started →</Button>
      </Link>
    </div>
  );
}
