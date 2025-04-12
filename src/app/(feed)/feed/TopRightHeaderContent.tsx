import { ListIcon } from "lucide-react";
import Link from "next/link";
import { ColorThemePopoverButton } from "~/components/color-theme/ColorThemePopoverButton";
import { CustomVideoButton } from "~/components/CustomVideoButton";
import { Button, ResponsiveButton } from "~/components/ui/button";
import { RefetchItemsButton } from "./RefetchItemsButton";

export function TopRightHeaderContent() {
  return (
    <div className="flex items-center gap-2">
      <RefetchItemsButton />
      <Link href="/feed/edit" prefetch>
        <ResponsiveButton size="icon" variant="outline">
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
