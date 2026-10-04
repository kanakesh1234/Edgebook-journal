export function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true" className="-mt-0.5 mr-1 inline">
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  );
}
