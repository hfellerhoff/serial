import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";
import { buttonVariants } from "./component-variants";

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = ({
  className,
  variant,
  size,
  asChild = false,
  ref,
  ...props
}: ButtonProps & React.RefAttributes<HTMLButtonElement>) => {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
};
Button.displayName = "Button";

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
