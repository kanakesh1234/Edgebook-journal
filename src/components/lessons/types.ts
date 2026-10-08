/** Shape returned by GET /api/lessons. Unchanged from the original page-level interface. */
export interface LessonView {
  id: string;
  title: string;
  subtitle: string;
  createdAt: number;
  html: string;
  cover: string | null;
  /** The cover the author picked, or null when the cover is chosen automatically. */
  customCover: string | null;
  excerpt: string;
  hook: string;
  readMins: number;
  author: { handle: string; name: string };
  bylines: string[];
  settings: { comments: boolean; reposts: boolean };
  mine: boolean;
  likes: number;
  likedByMe: boolean;
  reposts: number;
  repostedByMe: boolean;
  savedByMe: boolean;
  repostedBy: string[];
  comments: { id: string; by: string; body: string; at: number }[];
}

export type LessonAction = "like" | "repost" | "save";

/** Where a lesson stands for this reader on this device. */
export type ReadStatus = "unread" | "reading" | "read";
