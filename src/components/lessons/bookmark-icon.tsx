/** Kept for backwards compatibility — the canonical icon set lives in lesson-icons.tsx. */
import { BookmarkIcon as Icon } from "./lesson-icons";

export function BookmarkIcon({ filled, className }: { filled: boolean; className?: string }) {
  return <Icon filled={filled} className={className} />;
}
