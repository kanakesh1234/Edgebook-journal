import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { filled?: boolean };
const base = (p: P) => ({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p });
const strip = ({ filled: _x, ...r }: P) => r;

/** Nav icon: a vertical card with a play mark — the Feed. */
export const FeedIcon = (p: P) => (
  <svg {...base(strip(p))}><rect x="6" y="2.5" width="12" height="19" rx="3.2" /><path d="M10.6 9.4v5.2l4.2-2.6-4.2-2.6Z" fill="currentColor" stroke="none" /></svg>
);
export const HeartIcon = (p: P) => (
  <svg {...base(strip(p))} fill={p.filled ? "currentColor" : "none"}><path d="M12 20.4s-7.6-4.5-7.6-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.6 2.6c0 5.7-7.6 10.2-7.6 10.2Z" /></svg>
);
export const BookmarkPlusIcon = (p: P) => (
  <svg {...base(strip(p))} fill={p.filled ? "currentColor" : "none"}><path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4.3L5.5 21V4.5a1 1 0 0 1 1-1Z" />{!p.filled && <path d="M12 7.6v4.4M9.8 9.8h4.4" />}</svg>
);
export const PlayIcon = (p: P) => <svg {...base(strip(p))} fill="currentColor" stroke="none"><path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l11-6.8a.8.8 0 0 0 0-1.4l-11-6.8A.8.8 0 0 0 8 5.2Z" /></svg>;
export const PauseIcon = (p: P) => <svg {...base(strip(p))} fill="currentColor" stroke="none"><rect x="6.5" y="5" width="4" height="14" rx="1.2" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" /></svg>;
export const StepIcon = ({ dir = 1, ...p }: P & { dir?: 1 | -1 }) => (
  <svg {...base(strip(p))} style={{ transform: dir === -1 ? "scaleX(-1)" : undefined }}><path d="M7 5.5v13l8-6.5-8-6.5Z" fill="currentColor" stroke="none" /><path d="M18 5.5v13" /></svg>
);
export const RestartIcon = (p: P) => <svg {...base(strip(p))}><path d="M4 12a8 8 0 1 0 2.6-5.9" /><path d="M4 4.5v4.2h4.2" /></svg>;
export const MusicIcon = ({ off, ...p }: P & { off?: boolean }) => (
  <svg {...base(strip(p))}><path d="M9 17.5V6l10-2v11.5" /><circle cx="6.8" cy="17.5" r="2.2" /><circle cx="16.8" cy="15.5" r="2.2" />{off && <path d="M3.5 3.5l17 17" />}</svg>
);
export const SlidersIcon = (p: P) => <svg {...base(strip(p))}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>;
export const ArrowUpRightIcon = (p: P) => <svg {...base(strip(p))}><path d="M7 17 17 7M8.5 7H17v8.5" /></svg>;
export const CheckIcon = (p: P) => <svg {...base(strip(p))}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
export const XIcon = (p: P) => <svg {...base(strip(p))}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const PlusIcon = (p: P) => <svg {...base(strip(p))}><path d="M12 5v14M5 12h14" /></svg>;
export const ChevronUpIcon = (p: P) => <svg {...base(strip(p))}><path d="m6 14.5 6-6 6 6" /></svg>;
