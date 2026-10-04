# Edgebook update — friends fix, image uploads, glass article cards, flat lesson buttons

Copy every file in this folder into the SAME path in your project (src/... is already laid out).

DELETE (no longer used):
- src/app/api/friends/competition/   (whole folder — head-to-head is removed)

No new packages, no env changes.

Friends
- src/app/api/friends/route.ts            fix: incoming requests showed YOUR data (wrong "other person" email)
- src/app/(workspace)/friends/page.tsx    head-to-head removed; small trash icon (with confirm) replaces "Remove"

Mobile / tablet
- src/components/shell/nav.tsx            gear removed from the top bar; it now only appears at the bottom of the open menu

Lessons
- src/components/lessons/buttons.ts       flat buttons (3D shadows + press-down removed)
- src/components/lessons/lessons.css      editorial Liquid-Glass article cards (theme tokens only)
- src/app/(workspace)/lessons/page.tsx    feed uses the new cards
- src/app/(workspace)/lessons/[id]/page.tsx  renamed button imports

Image uploads
- src/lib/images.ts                       extension fallback, HEIC message, white flatten, lesson image prep/resize
- src/components/lessons/writer.tsx       normalises images before upload, shows the real reason on failure
- src/app/api/lessons/media/route.ts      JSON errors, content check, handles write failures
- src/lib/services/storage.ts             Drive screenshot upload retries transient failures
- src/components/journal/entry-form-modal.tsx  "Screenshot upload failed" toast
