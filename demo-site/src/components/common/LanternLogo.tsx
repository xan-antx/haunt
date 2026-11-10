export interface LanternLogoProps {
  /** Height in CSS pixels; the width follows the 40 × 52 drawing. */
  size?: number;
  className?: string;
}

/**
 * The Lantern Bills mark: an original drawing of a hanging lantern with a lit flame.
 * Always decorative, because the "Lantern Bills" wordmark is written next to it.
 */
export function LanternLogo({ size = 44, className }: LanternLogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 52"
      width={(size * 40) / 52}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      {/* Hanging ring and cap */}
      <circle cx="20" cy="4.5" r="3" fill="none" stroke="#ffc861" strokeWidth="2" />
      <path d="M13 13h14l-3.5-5h-7z" fill="#ffc861" />
      {/* Glass body with its warm glow */}
      <rect x="8" y="13" width="24" height="27" rx="8" fill="#f4a62a" stroke="#ffe3a3" strokeWidth="2" />
      <path d="M16 14v25M24 14v25" stroke="#c46d12" strokeWidth="1.5" strokeLinecap="round" />
      {/* Flame */}
      <path d="M20 19c4.5 5.5 5 9.5 0 13.5c-5-4-4.5-8 0-13.5z" fill="#fff6d8" />
      <path d="M20 24c2 2.5 2.2 4.5 0 6.5c-2.2-2-2-4 0-6.5z" fill="#f4a62a" />
      {/* Base and tassel */}
      <rect x="12.5" y="40" width="15" height="4.5" rx="1.5" fill="#ffc861" />
      <path d="M20 44.5v6" stroke="#ffc861" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default LanternLogo;
