import { TopLeftButton } from "./TopLeftButton";
import { TopRightHeaderContent } from "./TopRightHeaderContent";

export function Header() {
  return (
    <header className="top-0 z-20 flex h-20 w-full items-center justify-between bg-transparent px-6">
      <TopLeftButton />
      <TopRightHeaderContent />
    </header>
  );
}
