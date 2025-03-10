import { ListIcon } from "lucide-react";
import Link from "next/link";
import { ColorThemePopoverButton } from "~/components/color-theme/ColorThemePopoverButton";
import { CustomVideoButton } from "~/components/CustomVideoButton";
import { Button } from "~/components/ui/button";
import { RefetchItemsButton } from "./RefetchItemsButton";

function ResponsiveButton({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="md:hidden">
        <Button variant="outline" size="icon">
          {children}
        </Button>
      </div>
      <div className="hidden md:block">
        <Button variant="outline">{children}</Button>
      </div>
    </>
  );
}

export function TopRightHeaderContent() {
  return (
    <div className="flex items-center gap-2">
      <RefetchItemsButton />
      <Link href="/feed/edit" prefetch>
        <ResponsiveButton>
          <ListIcon size={16} />
          <span className="hidden pl-1.5 md:block">Feeds</span>
        </ResponsiveButton>
      </Link>
      <div className="md:hidden">
        <CustomVideoButton />
      </div>
      <ColorThemePopoverButton />
    </div>
  );
}
