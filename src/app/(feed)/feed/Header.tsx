import { TopLeftButton } from "./TopLeftButton";
import { TopRightHeaderContent } from "./TopRightHeaderContent";

export function Header() {
  return (
    <header className="top-0 z-20 flex w-full flex-wrap items-center justify-between gap-2 bg-transparent px-6 py-6">
      <TopLeftButton />
      <TopRightHeaderContent />
    </header>
  );
}
