# Challenges → Trading Lab

Copy each file into the SAME path in your project.

NEW (1)
- src/components/lab/challenges.tsx

REPLACE (4)
- src/app/(workspace)/lab/page.tsx
- src/app/(workspace)/challenges/page.tsx   (now just redirects /challenges -> /lab)
- src/components/shell/nav.tsx              (removes the sidebar "Challenges" item)
- src/components/cc/access-cards.tsx        (text only: points to Trading Lab)

No new packages, no env changes. `npx tsc --noEmit` passes.
