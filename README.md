# Edgebook Lessons redesign

Copy each file into the SAME path in your project.
No new packages, env changes, API or data changes. `tsc --noEmit` and `next build` pass.

REPLACED (5): lessons/page.tsx, lessons/[id]/page.tsx, components/lessons/lessons.css, buttons.ts, bookmark-icon.tsx
NEW (7): components/lessons/lesson-card.tsx, filters.tsx, lesson-icons.tsx, progress.ts, format.ts, types.ts, portal.tsx

Untouched: the writer (/lessons/new), API routes, storage, sanitizer, nav, globals.css.
`LessonView` is still exported from lessons/page.tsx, so existing imports keep working.
