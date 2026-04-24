import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, leftIcon, rightIcon, children, className, disabled, ...props }, ref) => {
    const classes = [
      "lume-btn",
      `lume-btn-${variant}`,
      size !== "md" && `lume-btn-${size}`,
      className,
    ].filter(Boolean).join(" ");
    return (
      <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
        {loading ? <span aria-hidden>…</span> : leftIcon}
        {children}
        {!loading && rightIcon}
      </button>
    );
  }
);
Button.displayName = "Button";
