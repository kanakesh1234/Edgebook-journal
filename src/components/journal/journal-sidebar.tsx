"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sym, type SymName } from "./symbols";
import { SPRING } from "./journal-ui";
import { monthLabel, type Lens, type YearNode } from "./journal-model";
import { cn } from "@/lib/utils";

export type SidebarSetup = { id: string; name: string; count: number };
export type SidebarLesson = { id: string; title: string; count: number };

function Row({ icon, label, count, selected, onClick, indent = 0, lead }: {
  icon?: SymName; label: string; count?: number; selected?: boolean; onClick: () => void; indent?: number; lead?: React.ReactNode;
}) {
  return (
    <button
      type="button" onClick={onClick} aria-current={selected ? "true" : undefined}
      style={{ paddingLeft: 8 + indent }}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-[9px] pr-2.5 text-left text-[14px] outline-none transition-colors duration-150",
        "focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:bg-ink/[0.1]",
        selected ? "bg-gold/[0.14] font-medium text-ink" : "text-ink/85 hover:bg-ink/[0.05]",
      )}
    >
      {lead}
      {icon && <Sym name={icon} className={cn("h-[17px] w-[17px]", selected ? "text-gold" : "text-muted")} />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && <span className="num text-[12px] text-faint">{count}</span>}
    </button>
  );
}

const Heading = ({ children }: { children: React.ReactNode }) => (
  <p className="px-2.5 pb-1 pt-5 text-[12px] font-semibold text-faint">{children}</p>
);

/** The navigator: Library · Dates (Year ▸ Month) · Setups. Selection mirrors the Folder view's path. */
export function SidebarContent({
  total, review, tree, path, lens, setups, lessons = [], onLens, onPath,
}: {
  total: number; review: number; tree: YearNode[]; path: string; lens: Lens; setups: SidebarSetup[]; lessons?: SidebarLesson[];
  onLens: (l: Lens) => void; onPath: (p: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(tree[0] ? [tree[0].key] : []));
  // Keep the active year expanded so the tree always shows where you are.
  useEffect(() => { if (path) setOpen((s) => (s.has(path.slice(0, 4)) ? s : new Set(s).add(path.slice(0, 4)))); }, [path]);
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <nav aria-label="Journal navigator" className="px-2 pb-6 pt-1">
      <Row icon="tray" label="All trades" count={total} selected={lens.kind === "all" && !path} onClick={() => { onLens({ kind: "all" }); onPath(""); }} />
      <Row icon="circleHalf" label="Needs review" count={review} selected={lens.kind === "review" && !path} onClick={() => { onLens({ kind: "review" }); onPath(""); }} />

      {tree.length > 0 && <Heading>Dates</Heading>}
      {tree.map((y) => {
        const isOpen = open.has(y.key);
        return (
          <div key={y.key}>
            <Row
              label={y.key} count={y.count} selected={path === y.key} onClick={() => onPath(y.key)}
              lead={
                <span
                  role="button" tabIndex={-1} aria-label={isOpen ? `Collapse ${y.key}` : `Expand ${y.key}`}
                  onClick={(e) => { e.stopPropagation(); toggle(y.key); }}
                  className="-ml-1 grid h-5 w-5 place-items-center rounded-md text-faint hover:bg-ink/[0.07] hover:text-ink"
                >
                  <Sym name="chevronRight" className={cn("h-3 w-3 transition-transform duration-200", isOpen && "rotate-90")} strokeWidth={2.2} />
                </span>
              }
            />
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden">
                  {y.months.map((m) => (
                    <Row key={m.key} label={monthLabel(m.key).split(" ")[0]} count={m.count} indent={22} selected={path === m.key || path.startsWith(m.key)} onClick={() => onPath(m.key)} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {setups.length > 0 && <Heading>Setups</Heading>}
      {setups.map((s) => (
        <Row key={s.id} icon="book" label={s.name} count={s.count} selected={lens.kind === "setup" && lens.id === s.id} onClick={() => { onLens({ kind: "setup", id: s.id }); onPath(""); }} />
      ))}

      {lessons.length > 0 && <Heading>Lessons</Heading>}
      <AnimatePresence initial={false}>
        {lessons.map((l) => (
          <motion.div key={l.id} layout="position" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={SPRING}>
            <Row icon="bulb" label={l.title} count={l.count} selected={lens.kind === "lesson" && lens.id === l.id} onClick={() => { onLens({ kind: "lesson", id: l.id }); onPath(""); }} />
          </motion.div>
        ))}
      </AnimatePresence>
    </nav>
  );
}
