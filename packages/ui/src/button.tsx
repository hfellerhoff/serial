import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { buttonVariants } from "./component-variants";
import { cn } from "./lib/cn";
import type { VariantProps } from "class-variance-authority";

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

export { Button };
