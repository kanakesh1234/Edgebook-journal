"use client";

import { useParams } from "next/navigation";
import { MatrixTradeDetail } from "@/components/matrix/trade-detail";

export default function MatrixTradePage() {
  const params = useParams<{ tradeId: string }>();
  return <MatrixTradeDetail tradeId={params.tradeId} />;
}
