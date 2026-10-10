"use client";

import { AnimatePresence, motion } from "motion/react";
import { Heading, Row } from "@/components/journal/journal-sidebar";
import { SPRING } from "@/components/journal/journal-ui";
import { UNSORTED, type Facet, type Lens } from "@/lib/practice/ict-library";

/** The navigator: Library · Concepts · Tags. Same rows, spacing and selection as the Journal's. */
export function IctSidebar({ total, needs, concepts, tags, lens, onLens }: { total: number; needs: number; concepts: Facet[]; tags: Facet[]; lens: Lens; onLens: (l: Lens) => void }) {
  const isConcept = (name: string) => lens.kind === "concept" && lens.name.toLowerCase() === name.toLowerCase();
  return (
    <nav aria-label="ICT Lab navigator" className="px-2 pb-6 pt-1">
      <Row icon="tray" label="All questions" count={total} selected={lens.kind === "all"} onClick={() => onLens({ kind: "all" })} />
      <Row icon="circleHalf" label="Needs practice" count={needs} selected={lens.kind === "practice"} onClick={() => onLens({ kind: "practice" })} />

      {concepts.length > 0 && <Heading>Concepts</Heading>}
      <AnimatePresence initial={false}>
        {concepts.map((c) => (
          <motion.div key={c.key} layout="position" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={SPRING}>
            <Row icon={c.key === UNSORTED ? "folder" : "bulb"} label={c.key} count={c.count} selected={isConcept(c.key)} onClick={() => onLens({ kind: "concept", name: c.key })} />
          </motion.div>
        ))}
      </AnimatePresence>

      {tags.length > 0 && <Heading>Tags</Heading>}
      <AnimatePresence initial={false}>
        {tags.map((t) => (
          <motion.div key={t.key} layout="position" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={SPRING}>
            <Row icon="tag" label={t.key} count={t.count} selected={lens.kind === "tag" && lens.name === t.key} onClick={() => onLens({ kind: "tag", name: t.key })} />
          </motion.div>
        ))}
      </AnimatePresence>
    </nav>
  );
}
