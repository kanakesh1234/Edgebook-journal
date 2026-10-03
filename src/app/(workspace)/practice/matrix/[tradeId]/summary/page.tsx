"use client";

import { useParams } from "next/navigation";
import { MatrixTestSummary } from "@/components/matrix/test-summary";

export default function MatrixSummaryPage() {
  const params = useParams<{ tradeId: string }>();
  return <MatrixTestSummary tradeId={params.tradeId} />;
}
