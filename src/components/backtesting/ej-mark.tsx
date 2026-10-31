/** EdgeJournal monogram — a squircle with an "EJ" ligature and a tiny candle wick. Pass title="" for decorative use. */
export default function EJMark({ size = 24, title = "EdgeJournal" }: { size?: number; title?: string }) {
  const decorative = !title;
  return (
    <span
      className="ej-mark" style={{ width: size, height: size }}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": title, "data-tip": title })}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id="ej-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7C7AFF" /><stop offset="1" stopColor="#0A84FF" />
          </linearGradient>
        </defs>
        <rect x="0.5" y="0.5" width="23" height="23" rx="7" fill="url(#ej-g)" />
        <path d="M7 7.2h5.6M7 7.2v9.6h5.6M7 12h4.4" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M16.4 6v3.4M16.4 14.2v3.8" stroke="#fff" strokeOpacity=".75" strokeWidth="1.4" strokeLinecap="round" />
        <rect x="14.9" y="9.4" width="3" height="4.8" rx="1" fill="#fff" />
      </svg>
    </span>
  );
}
