# Lesson writer update

1. Install four packages:
   npm i @tiptap/extension-text-style@3 @tiptap/extension-highlight@3 @tiptap/extension-text-align@3 @fontsource/spectral

2. Copy every file in this folder into the SAME path in your project (src/... is already laid out).

3. Optional cleanup: src/components/lessons/rich-editor.tsx is no longer used and can be deleted. Keep buttons.ts.

4. Restart `npm run dev`.

No env changes. `npx tsc --noEmit` and `next build` pass with these files in place.
