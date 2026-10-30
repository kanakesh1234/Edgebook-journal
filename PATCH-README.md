# Landing page patch: "The Ledger"

Unzip over the project root (same relative paths). Theme tokens, Inter / Instrument Serif / JetBrains Mono,
auth, routing and the logged-in app are untouched. No new dependencies.

## Recoverable
Before copying, back up the files marked MODIFIED (e.g. `git stash` / commit, or copy them aside).
To roll back, restore those files and delete the three NEW files.

| Path | Status | What changed |
|---|---|---|
| src/app/page.tsx | MODIFIED | Page-level metadata (title, description, Open Graph); new section order: story, Gap, Minato, Drive, Toolkit, Road, Calm, CTA |
| src/components/landing/journey-stage.tsx | MODIFIED | New hero copy + eyebrow + trust line; demo trade labelled "Sample trade"; removed a hard-coded 74% win-odds figure |
| src/components/landing/gap.tsx | NEW | "The gap": the five Autopsy questions on a ledger-paper card |
| src/components/landing/minato-demo.tsx | NEW | Minato section with a labelled sample conversation |
| src/components/landing/ledger.tsx | NEW | `Eyebrow` (№ 01 style) used across sections |
| src/components/landing/nav.tsx | MODIFIED | Adds a Minato link; Toolkit/Roadmap links show from xl up to avoid crowding |
| src/components/landing/drive-statement.tsx | MODIFIED | Ledger eyebrow |
| src/components/landing/toolkit.tsx | MODIFIED | Ledger eyebrow; "screens use sample data" note |
| src/components/landing/road.tsx | MODIFIED | Ledger eyebrow |
| src/components/landing/calm.tsx | MODIFIED | Ledger eyebrow |
| src/components/landing/footer-cta.tsx | MODIFIED | Closing CTA copy |

Note: `footer-cta.tsx` and `page.tsx` were also in the previous update zip; this version supersedes it.
