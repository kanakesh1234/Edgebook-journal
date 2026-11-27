"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { todayKey } from "@/lib/format";
import { monthOf, mondayOf } from "@/lib/review/period";
import { Sym } from "@/components/journal/symbols";
import { EntryDetailModal } from "@/components/journal/entry-detail-modal";
import { ReviewsPanel, type ReviewKindId } from "@/components/review/reviews-panel";

/** Practice → Weekly Review: shares the unified Apple Weekly & Monthly review experience. */
export function WeeklyReview() {
  const router = useRouter();
  const entries = useApp((s) => s.entries);
  const [kind, setKind] = useState<ReviewKindId>("weekly");
  const [week, setWeek] = useState(() => mondayOf(todayKey()));
  const [month, setMonth] = useState(() => monthOf(todayKey()));
  const [viewingId, setViewingId] = useState<string | null>(null);

  const viewing = useMemo(() => entries.find((e) => e.id === viewingId) ?? null, [entries, viewingId]);

  const actions = useMemo(
    () => ({
      openTrade: (id: string) => setViewingId(id),
      openMistake: (key: string) => router.push(`/journal?mistake=${encodeURIComponent(key)}`),
      openIds: (ids: string[]) => {
        if (ids[0]) setViewingId(ids[0]);
      },
      openWeek: (m: string) => {
        setWeek(m);
        setKind("weekly");
      },
    }),
    [router],
  );

  return (
    <div className="mx-auto w-full max-w-[960px] pb-24 sm:pb-14">
      <Link href="/practice" className="inline-flex items-center gap-1 text-[14px] font-medium text-muted transition-colors hover:text-ink">
        <Sym name="chevronLeft" className="h-4 w-4" />
        Practice
      </Link>

      <ReviewsPanel
        kind={kind}
        onKind={setKind}
        week={week}
        onWeek={setWeek}
        month={month}
        onMonth={setMonth}
        actions={actions}
      />

      <EntryDetailModal
        open={!!viewing}
        entry={viewing}
        onClose={() => setViewingId(null)}
      />
    </div>
  );
}
