"use client";

import { useParams } from "next/navigation";
import { MatrixTestFlow } from "@/components/matrix/test-flow";

export default function MatrixTestPage() {
  const params = useParams<{ tradeId: string }>();
  return <MatrixTestFlow tradeId={params.tradeId} />;
}
