import type { AchievementIcon } from "@/lib/practice/achievements";

/** SF-Symbols-style glyphs: 24px grid, 1.75 rounded stroke, no fills unless the shape needs one. */
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
type P = { className?: string };

export const FlameIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M12 3c.6 3 4.5 4.6 4.5 9.2A4.5 4.5 0 0 1 12 17a4.5 4.5 0 0 1-4.5-4.8c0-1.6.7-2.7 1.6-3.6.2 1.1.8 1.7 1.5 1.9C10.2 8 10.6 5 12 3Z" /><path d="M9.5 20.5h5" opacity=".5" /></svg>
);
export const BoltIcon = ({ className }: P) => (<svg {...base} className={className}><path d="M13 3 5.5 13.2h5.2L10 21l8-10.4h-5.3L13 3Z" /></svg>);
export const TargetIcon = ({ className }: P) => (<svg {...base} className={className}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.6" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>);
export const TrophyIcon = ({ className }: P) => (<svg {...base} className={className}><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" /></svg>);
export const MedalIcon = ({ className }: P) => (<svg {...base} className={className}><circle cx="12" cy="14.5" r="5" /><path d="m9.2 10.2-2-6.2h4l1 3M14.8 10.2l2-6.2h-4l-1 3" /><path d="m12 12.5.8 1.6 1.7.2-1.25 1.2.3 1.7-1.55-.8-1.55.8.3-1.7-1.25-1.2 1.7-.2.8-1.6Z" strokeWidth={1.2} /></svg>);
export const StarIcon = ({ className }: P) => (<svg {...base} className={className}><path d="m12 3.8 2.5 5.1 5.6.8-4.05 4 .95 5.6L12 16.6 7 19.3l.95-5.6-4.05-4 5.6-.8L12 3.8Z" /></svg>);
export const BrainIcon = ({ className }: P) => (<svg {...base} className={className}><path d="M12 5.5v13M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-1.5 5.2A3.3 3.3 0 0 0 7 18.4a2.8 2.8 0 0 0 5 .9M15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 1.5 5.2 3.3 3.3 0 0 1-2.5 5.7 2.8 2.8 0 0 1-5 .9" /></svg>);
export const CrownIcon = ({ className }: P) => (<svg {...base} className={className}><path d="m4 8 4.2 4L12 5l3.8 7L20 8l-1.6 10H5.6L4 8Z" /><path d="M6 20.5h12" opacity=".5" /></svg>);
export const CalendarIcon = ({ className }: P) => (<svg {...base} className={className}><rect x="4" y="5.5" width="16" height="14.5" rx="3.2" /><path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5" /><path d="m9.2 15 2 2 3.6-3.8" /></svg>);
export const CompassIcon = ({ className }: P) => (<svg {...base} className={className}><circle cx="12" cy="12" r="8.5" /><path d="m15.6 8.4-2 5.2-5.2 2 2-5.2 5.2-2Z" /></svg>);
export const CheckIcon = ({ className }: P) => (<svg {...base} strokeWidth={2.4} className={className}><path d="m5.5 12.5 4.2 4.2L18.5 7.5" /></svg>);
export const GiftIcon = ({ className }: P) => (<svg {...base} className={className}><rect x="4" y="9" width="16" height="11" rx="2.5" /><path d="M3.5 9h17v3h-17zM12 9v11M12 9c-2.8 0-4.5-1-4.5-2.6S9 4 10.4 4.6C11.6 5.1 12 7 12 9Zm0 0c2.8 0 4.5-1 4.5-2.6S15 4 13.6 4.6C12.4 5.1 12 7 12 9Z" /></svg>);
export const LockIcon = ({ className }: P) => (<svg {...base} className={className}><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" /></svg>);
export const ChevronIcon = ({ className }: P) => (<svg {...base} strokeWidth={2} className={className}><path d="m9.5 6 6 6-6 6" /></svg>);
export const SnowIcon = ({ className }: P) => (<svg {...base} className={className}><path d="M12 3.5v17M4.6 7.75l14.8 8.5M4.6 16.25l14.8-8.5M9.5 5l2.5 2 2.5-2M9.5 19l2.5-2 2.5 2" /></svg>);

export const ACHIEVEMENT_ICON: Record<AchievementIcon, (p: P) => React.JSX.Element> = {
  flame: FlameIcon, bolt: BoltIcon, target: TargetIcon, trophy: TrophyIcon, medal: MedalIcon, star: StarIcon, brain: BrainIcon, crown: CrownIcon, calendar: CalendarIcon, compass: CompassIcon,
};

/* SF-Symbols-style additions for the question composer and ICT Lab. */
export const PhotoIcon = ({ className }: P) => (<svg {...base} className={className}><rect x="3.5" y="5" width="17" height="14" rx="3.6" /><circle cx="9" cy="10.4" r="1.6" /><path d="m4.5 17.2 4.9-4.6 3.5 3.2 2.5-2.1 4.1 3.6" /></svg>);
export const SparkleIcon = ({ className }: P) => (<svg {...base} className={className}><path d="M10 4.5 11.4 8.6l4.1 1.4-4.1 1.4L10 15.5l-1.4-4.1L4.5 10l4.1-1.4L10 4.5Z" /><path d="m17.5 14 .7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" strokeWidth={1.5} /></svg>);
export const PlusIcon = ({ className }: P) => (<svg {...base} strokeWidth={2} className={className}><path d="M12 5.5v13M5.5 12h13" /></svg>);
export const PencilIcon = ({ className }: P) => (<svg {...base} className={className}><path d="m4.5 19.5.9-4 9.6-9.6a2 2 0 0 1 2.8 0l.3.3a2 2 0 0 1 0 2.8l-9.6 9.6-4 .9Z" /><path d="m13.5 7.5 3 3" /></svg>);
export const TrashIcon = ({ className }: P) => (<svg {...base} className={className}><path d="M5 7h14M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7M6.8 7l.8 11.2A2 2 0 0 0 9.6 20h4.8a2 2 0 0 0 2-1.8L17.2 7M10 11v5M14 11v5" /></svg>);
export const ChevronLeftIcon = ({ className }: P) => (<svg {...base} strokeWidth={2} className={className}><path d="m14.5 6-6 6 6 6" /></svg>);
/** xmark.circle.fill — the remove badge on an attachment. */
export const CloseBadgeIcon = ({ className }: P) => (<svg viewBox="0 0 24 24" className={className} aria-hidden><circle cx="12" cy="12" r="10" fill="currentColor" /><path d="m8.8 8.8 6.4 6.4M15.2 8.8l-6.4 6.4" stroke="var(--surface)" strokeWidth="2" strokeLinecap="round" /></svg>);
