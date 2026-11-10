/** Decorative left arrow for "Back to bill" links; the link text gives the name. */
export function BackArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" style={{ display: 'block', flexShrink: 0 }}>
      <path
        d="M19 12H6M11 6.5L5.5 12l5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default BackArrowIcon;
