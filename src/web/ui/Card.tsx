import { HTMLAttributes, forwardRef } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  padding?: "sm" | "md" | "lg" | "none";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ interactive, padding = "md", className, style, ...props }, ref) => {
    const padMap = { none: 0, sm: 12, md: 24, lg: 32 };
    const classes = ["lume-card", interactive && "lume-card-interactive", className].filter(Boolean).join(" ");
    return (
      <div
        ref={ref}
        className={classes}
        style={{ padding: padMap[padding], ...style }}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";
