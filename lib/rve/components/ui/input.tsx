import * as React from "react";

import { cn } from "../../utils/general/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "file:text-foreground text-foreground placeholder:text-muted-foreground border border-border selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-sm border bg-input/30 px-3 py-1 shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-extralight disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[0.5px]",
          "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
