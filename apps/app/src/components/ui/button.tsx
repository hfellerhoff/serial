import * as React from "react";
import { Button } from "@serial/ui";
import type { ButtonProps } from "@serial/ui";

const ResponsiveButton = ({
  size,
  children,
  ref,
  ...props
}: ButtonProps & React.RefAttributes<HTMLButtonElement>) => {
  const childrenCount = React.Children.toArray(children).filter(Boolean).length;

  if (size === "icon" && childrenCount > 1) {
    size = "icon md:default";
  }

  return (
    <Button ref={ref} size={size} {...props}>
      {children}
    </Button>
  );
};
ResponsiveButton.displayName = "ResponsiveButton";

export { Button, ResponsiveButton };
export type { ButtonProps };
