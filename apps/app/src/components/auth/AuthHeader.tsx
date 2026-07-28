import type { PropsWithChildren } from "react";
import { CardHeader } from "~/components/ui/card";

export function AuthHeader({
  children,
  removePadding = false,
}: PropsWithChildren<{
  removePadding?: boolean;
}>) {
  return (
    <CardHeader className={removePadding ? "" : "pb-4"}>
      <div className="flex flex-col items-center justify-center gap-4 pb-6">
        <img
          className="size-16 rounded-xl"
          src="/icon-256.png"
          alt="Serial icon"
        />
      </div>
      {children}
    </CardHeader>
  );
}
