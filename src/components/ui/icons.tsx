/* Lightweight inline icon set (stroke style) — zero dependencies. */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1em"
      height="1em"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const ArrowLeftIcon = (p: P) => (
  <Svg {...p}>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </Svg>
);

export const ArrowRightIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Svg>
);

export const ChevronLeftIcon = (p: P) => (
  <Svg {...p}>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);

export const ChevronRightIcon = (p: P) => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);

export const ChevronDownIcon = (p: P) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const XIcon = (p: P) => (
  <Svg {...p}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Svg>
);

export const PlusIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Svg>
);

export const SearchIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7.5" />
    <path d="m21 21-4.2-4.2" />
  </Svg>
);

export const SlidersIcon = (p: P) => (
  <Svg {...p}>
    <path d="M21 4h-7" />
    <path d="M10 4H3" />
    <path d="M21 12h-9" />
    <path d="M8 12H3" />
    <path d="M21 20h-5" />
    <path d="M12 20H3" />
    <path d="M14 2v4" />
    <path d="M8 10v4" />
    <path d="M16 18v4" />
  </Svg>
);

export const SortIcon = (p: P) => (
  <Svg {...p}>
    <path d="m21 16-4 4-4-4" />
    <path d="M17 20V4" />
    <path d="m3 8 4-4 4 4" />
    <path d="M7 4v16" />
  </Svg>
);

export const PencilIcon = (p: P) => (
  <Svg {...p}>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </Svg>
);

export const TrashIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </Svg>
);

export const UploadIcon = (p: P) => (
  <Svg {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m17 8-5-5-5 5" />
    <path d="M12 3v12" />
  </Svg>
);

export const DownloadIcon = (p: P) => (
  <Svg {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5" />
    <path d="M12 15V3" />
  </Svg>
);

export const ImageIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-4.35-4.35a1.5 1.5 0 0 0-2.12 0L5 20" />
  </Svg>
);

export const EyeIcon = (p: P) => (
  <Svg {...p}>
    <path d="M2.06 12.35a1 1 0 0 1 0-.7C3.42 8.1 7.22 5.5 12 5.5s8.58 2.6 9.94 6.15a1 1 0 0 1 0 .7C20.58 15.9 16.78 18.5 12 18.5s-8.58-2.6-9.94-6.15Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const CheckIcon = (p: P) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);

export const CheckCircleIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.8-5.3" />
  </Svg>
);

export const AlertTriangleIcon = (p: P) => (
  <Svg {...p}>
    <path d="m10.3 3.86 -8.02 13.9A2 2 0 0 0 4 21h16a2 2 0 0 0 1.72-3.24L13.7 3.86a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Svg>
);

export const InfoIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </Svg>
);

export const SparklesIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9Z" />
    <path d="M19 14.5l.95 2.3 2.3.95-2.3.95-.95 2.3-.95-2.3-2.3-.95 2.3-.95Z" />
  </Svg>
);

export const CalendarIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="17" rx="3" />
    <path d="M16 2.5v4" />
    <path d="M8 2.5v4" />
    <path d="M3 10h18" />
  </Svg>
);

export const ChartLineIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 3v16a2 2 0 0 0 2 2h16" />
    <path d="m7 14 4-4 3.5 3.5L20 8" />
  </Svg>
);

export const RouteIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="6" cy="19" r="2.6" />
    <circle cx="18" cy="5" r="2.6" />
    <path d="M8.6 19h6a3.4 3.4 0 0 0 0-6.8h-5.2a3.4 3.4 0 0 1 0-6.8h6" />
  </Svg>
);

export const BookOpenIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 6.5A3.5 3.5 0 0 0 8.5 3H3v15h6a3 3 0 0 1 3 3 3 3 0 0 1 3-3h6V3h-5.5A3.5 3.5 0 0 0 12 6.5Z" />
    <path d="M12 6.5V21" />
  </Svg>
);

export const SettingsIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M18.9 8.6a7.9 7.9 0 0 1 .1 3.4l2 1.6-2 3.4-2.4-1a8 8 0 0 1-3 1.7L13.2 20h-2.4l-.4-2.3a8 8 0 0 1-3-1.7l-2.4 1-2-3.4 2-1.6a7.9 7.9 0 0 1 0-3.4l-2-1.6 2-3.4 2.4 1a8 8 0 0 1 3-1.7L10.8 4h2.4l.4 2.3a8 8 0 0 1 3 1.7l2.4-1 2 3.4Z" />
  </Svg>
);

export const LogoutIcon = (p: P) => (
  <Svg {...p}>
    <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
);

export const TargetIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </Svg>
);

export const FlameIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 2c1.5 3-0.5 4.5-1.8 6.1C8.9 9.7 8 11.2 8 13a4 4 0 0 0 8 0c0-1-.3-1.9-.8-2.7-.6 1-1.2 1.4-1.9 1.4.6-2.3.2-4.9-1.3-6.9A9.8 9.8 0 0 0 12 2Z" transform="translate(0,3)" />
  </Svg>
);

export const WalletIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="14" rx="3" />
    <path d="M3 10h18" />
    <path d="M16 15h.01" strokeWidth={2.4} />
  </Svg>
);

export const TrendingUpIcon = (p: P) => (
  <Svg {...p}>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </Svg>
);

export const TrendingDownIcon = (p: P) => (
  <Svg {...p}>
    <path d="m3 7 6 6 4-4 8 8" />
    <path d="M21 10v7h-7" />
  </Svg>
);

export const ShieldIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 2 4 5.5V11c0 5 3.4 9.3 8 10.5 4.6-1.2 8-5.5 8-10.5V5.5Z" />
    <path d="m9 12 2 2 4-4.5" />
  </Svg>
);

export const AwardIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="9" r="6" />
    <path d="m8.5 14-1.5 8 5-3 5 3-1.5-8" />
  </Svg>
);

export const FlagIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 21V4.5" />
    <path d="M5 5h12.5l-3 4.25 3 4.25H5" />
  </Svg>
);

export const CloudIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7 18a4.5 4.5 0 1 1 .9-8.9 5.5 5.5 0 0 1 10.7 1.6A3.7 3.7 0 0 1 17.8 18Z" />
  </Svg>
);

export const TrophyIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
    <path d="M8 5H5.5a0 0 0 0 0 0 0c0 2.5 1 4 2.5 4.5" />
    <path d="M16 5h2.5c0 2.5-1 4-2.5 4.5" />
    <path d="M12 13v3.5" />
    <path d="M8.5 20h7" />
    <path d="M10 20c0-2 .5-3.5 2-3.5s2 1.5 2 3.5" />
  </Svg>
);

export const UserIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Svg>
);

export const StarIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9L12 3.5Z" />
  </Svg>
);

export const CopyIcon = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a1.5 1.5 0 0 1 1.5-1.5H15" />
  </Svg>
);

export const AtIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1" />
  </Svg>
);

export const FlaskIcon = (p: P) => (
  <Svg {...p}>
    <path d="M9.5 3h5" />
    <path d="M10 3v5.2L4.6 17.6A2 2 0 0 0 6.4 20.5h11.2a2 2 0 0 0 1.8-2.9L14 8.2V3" />
    <path d="M7.2 14.5h9.6" />
  </Svg>
);

export const GoogleIcon = (p: P) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden {...p}>
    <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H.29v3.09A11.99 11.99 0 0 0 12 24Z" />
    <path fill="#FBBC05" d="M5.27 14.29A7.16 7.16 0 0 1 4.89 12c0-.8.14-1.57.38-2.29l-.01-.16H.32A11.94 11.94 0 0 0 0 12c0 1.94.46 3.77 1.32 5.38l3.95-3.09Z" />
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.32 6.62l3.95 3.09C6.22 6.86 8.87 4.75 12 4.75Z" />
  </svg>
);

export const SunIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2.2" />
    <path d="M12 19.8V22" />
    <path d="m4.9 4.9 1.6 1.6" />
    <path d="m17.5 17.5 1.6 1.6" />
    <path d="M2 12h2.2" />
    <path d="M19.8 12H22" />
    <path d="m4.9 19.1 1.6-1.6" />
    <path d="m17.5 6.5 1.6-1.6" />
  </Svg>
);

export const MoonIcon = (p: P) => (
  <Svg {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </Svg>
);

export const MonitorIcon = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="19" height="13" rx="2.5" />
    <path d="M9 21h6" />
    <path d="M12 17v4" />
  </Svg>
);
