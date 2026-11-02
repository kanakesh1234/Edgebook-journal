import { NextResponse } from "next/server";
import { fetchMajorForexFactoryEventsServer, todayNyIso } from "@/lib/minato/forexfactory";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date")?.trim() || todayNyIso();
  const currenciesParam = searchParams.get("currencies")?.trim();
  const currencies = currenciesParam
    ? currenciesParam.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean)
    : ["USD"];

  const result = await fetchMajorForexFactoryEventsServer(date, currencies, false);
  return NextResponse.json(result);
}
