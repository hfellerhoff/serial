import Link from "next/link";
import { Button } from "~/components/ui/button";
import { AUTH_PAGE_URL } from "~/server/auth/constants";

export function GetStartedButton() {
  return (
    <Link href={AUTH_PAGE_URL} className="hover:bg-transparent">
      <Button className="mt-4 mb-8 md:mb-12">Get Started →</Button>
    </Link>
  );
}
