"use client";

import { useParams } from "next/navigation";
import { MatrixChartStudy } from "@/components/matrix/chart-study";

export default function MatrixChartsPage() {
  const params = useParams<{ tradeId: string }>();
  return <MatrixChartStudy tradeId={params.tradeId} />;
}
