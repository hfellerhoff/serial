import type { ReactNode } from "react";

type PopupLayoutProps = {
  children: ReactNode;
  footer?: ReactNode;
};

export function PopupLayout({ children, footer }: PopupLayoutProps) {
  return (
    <main className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col px-5 pt-5">{children}</div>
      {footer && (
        <footer className="from-background sticky bottom-0 z-10 bg-gradient-to-t from-70% to-transparent px-5 pt-10 pb-5">
          {footer}
        </footer>
      )}
    </main>
  );
}
