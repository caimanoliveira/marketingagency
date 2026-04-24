interface AvatarProps {
  src?: string | null;
  alt?: string;
  size?: number;
  fallback?: string;
  className?: string;
}

export function Avatar({ src, alt = "", size = 40, fallback, className }: AvatarProps) {
  const initials = (fallback ?? alt ?? "?").slice(0, 2).toUpperCase();
  if (src) {
    return <img src={src} alt={alt} className={`lume-avatar ${className ?? ""}`} style={{ width: size, height: size }} />;
  }
  return (
    <div className={`lume-avatar lume-avatar-fallback ${className ?? ""}`} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials}
    </div>
  );
}
