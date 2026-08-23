"use client";

import { useApp } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { JourneyRoadmap } from "@/components/roadmap/journey-roadmap";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { PlusIcon, RouteIcon, SparklesIcon } from "@/components/ui/icons";

export default function RoadmapPage() {
  const entries = useApp((s) => s.entries);
  const openNewEntry = useUi((s) => s.openNewEntry);

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<RouteIcon className="h-7 w-7" />}
        title="Your road hasn't started yet"
        body="Log your first session — or load the demo journal — and watch the road from starting equity to your target come alive."
        action={
          <>
            <Button variant="gold" onClick={openNewEntry}>
              <PlusIcon className="h-4 w-4" />
              Log first trade
            </Button>
            <Button variant="outline" onClick={() => void useApp.getState().loadDemoData()}>
              <SparklesIcon className="h-4 w-4" />
              Load demo data
            </Button>
          </>
        }
      />
    );
  }

  return <JourneyRoadmap />;
}
