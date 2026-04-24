interface BadgeProps {
  children: React.ReactNode;
  color?: string;
  variant?: "solid" | "soft";
  className?: string;
}

export function Badge({ children, color, variant = "soft", className }: BadgeProps) {
  const style: React.CSSProperties = color
    ? variant === "solid"
      ? { background: color, color: "white" }
      : { background: `${color}22`, color }
    : {};
  return <span className={`lume-badge ${className ?? ""}`} style={style}>{children}</span>;
}
