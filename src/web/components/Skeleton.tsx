interface Props {
  width?: string;
  height?: string;
  className?: string;
  style?: React.CSSProperties;
}
export function Skeleton({ width = "100%", height = "16px", className = "", style }: Props) {
  return <div className={`skeleton ${className}`} style={{ width, height, ...style }} />;
}

export function SkeletonRow({ count = 4 }: { count?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height="48px" />
      ))}
    </div>
  );
}
