interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}

export function Logo({ size = 28, showWordmark = true, className }: LogoProps) {
  return (
    <div className={`lume-brand ${className ?? ""}`} style={{ margin: 0, padding: 0, gap: 8 }}>
      <svg
        className="lume-brand-mark"
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Lume"
      >
        {/* Warm glow — radial gradient flame */}
        <defs>
          <radialGradient id="lume-flame-grad" cx="0.5" cy="0.7" r="0.7">
            <stop offset="0%" stopColor="#FFB366" />
            <stop offset="55%" stopColor="#E85D1F" />
            <stop offset="100%" stopColor="#B8420C" />
          </radialGradient>
        </defs>
        {/* Flame shape */}
        <path
          d="M16 3.5 C 18.5 8, 22 11, 22.5 15.5 C 23 20, 20 24.5, 16 25.5 C 12 24.5, 9 20, 9.5 15.5 C 10 11, 13.5 8, 16 3.5 Z"
          fill="url(#lume-flame-grad)"
        />
        {/* Inner highlight */}
        <path
          d="M16 10 C 17 13, 18.5 14.5, 18.5 17.5 C 18.5 20, 17 22, 16 22 C 15 22, 13.5 20, 13.5 17.5 C 13.5 14.5, 15 13, 16 10 Z"
          fill="#FFCE9A"
          opacity="0.9"
        />
      </svg>
      {showWordmark && (
        <span className="lume-brand-name">lume</span>
      )}
    </div>
  );
}
