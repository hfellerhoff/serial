import { CustomVideoButton } from "~/components/CustomVideoButton";
import { OpenRightSidebarButton } from "./OpenRightSidebarButton";
import { RefetchItemsButton } from "./RefetchItemsButton";

export function TopRightHeaderContent() {
  return (
    <div className="flex items-center gap-2">
      <div className="md:hidden">
        <CustomVideoButton />
      </div>
      <RefetchItemsButton />
      <div className="md:hidden">
        <OpenRightSidebarButton />
      </div>
    </div>
  );
}
