import Link from "next/link";
import { Button } from "~/components/ui/button";

export function GetStartedButton() {
  return (
    <Link href="/feed" className="hover:bg-transparent">
      <Button className="mt-4 mb-8 md:mb-12">Get Started →</Button>
    </Link>
  );
}
