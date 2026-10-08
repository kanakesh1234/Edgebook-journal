"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import LessonWriter from "@/components/lessons/writer";
import { btnPrimary } from "@/components/lessons/buttons";
import { LessonsIcon } from "@/components/lessons/lessons-icon";
import type { LessonView } from "@/components/lessons/types";
import { EmptyState } from "@/components/ui/misc";

/** Edit one of your own lessons. Opens the same writer as /lessons/new, filled in. */
export default function EditLessonPage() {
  const { id } = useParams<{ id: string }>();
  const [l, setL] = useState<LessonView | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    fetch(`/api/lessons?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { lesson?: LessonView }).lesson ?? null : null))
      .catch(() => null)
      .then((lesson) => live && setL(lesson));
    return () => {
      live = false;
    };
  }, [id]);

  if (l === undefined) return <div className="wr" aria-busy="true" aria-label="Loading lesson" />;

  if (!l || !l.mine) {
    return (
      <div className="mx-auto w-full max-w-[680px]">
        <EmptyState
          className="mt-6 py-14"
          icon={<LessonsIcon className="h-7 w-7" />}
          title="This lesson can’t be edited"
          body="It may have been deleted, or it isn’t yours to edit."
          action={
            <Link href="/lessons" className={btnPrimary}>
              Back to Lessons
            </Link>
          }
        />
      </div>
    );
  }

  return <LessonWriter lesson={l} />;
}
