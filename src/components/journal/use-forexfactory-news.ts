"use client";

import { useCallback, useEffect, useState } from "react";
import { getDeterministicMajorUsEvents, type MajorNewsEvent } from "@/lib/minato/forexfactory";

interface ForexFactoryResponse {
  date: string;
  live: boolean;
  source: "forexfactory-live" | "us-macro-schedule";
  hasMajorNews: boolean;
  events: MajorNewsEvent[];
}

const clientCache = new Map<string, ForexFactoryResponse>();

export async function fetchMajorForexFactoryNews(
  dateKey: string,
  forceRefresh = false,
): Promise<ForexFactoryResponse> {
  if (!forceRefresh && clientCache.has(dateKey)) {
    return clientCache.get(dateKey)!;
  }
  try {
    const res = await fetch(`/api/minato/news?date=${encodeURIComponent(dateKey)}`, {
      cache: forceRefresh ? "no-store" : "default",
    });
    if (res.ok) {
      const data = (await res.json()) as ForexFactoryResponse;
      clientCache.set(dateKey, data);
      return data;
    }
  } catch {
    /* fallback below */
  }
  const fallbackEvents = getDeterministicMajorUsEvents(dateKey);
  const fallback: ForexFactoryResponse = {
    date: dateKey,
    live: false,
    source: "us-macro-schedule",
    hasMajorNews: fallbackEvents.length > 0,
    events: fallbackEvents,
  };
  clientCache.set(dateKey, fallback);
  return fallback;
}

export function useForexFactoryNews(dateKey: string, enabled = true) {
  const [data, setData] = useState<ForexFactoryResponse | null>(() => clientCache.get(dateKey) ?? null);
  const [loading, setLoading] = useState<boolean>(!clientCache.has(dateKey) && enabled);

  const refresh = useCallback(
    async (force = true) => {
      if (!dateKey) return null;
      setLoading(true);
      try {
        const res = await fetchMajorForexFactoryNews(dateKey, force);
        setData(res);
        return res;
      } finally {
        setLoading(false);
      }
    },
    [dateKey],
  );

  useEffect(() => {
    if (!enabled || !dateKey) return;
    let alive = true;
    const cached = clientCache.get(dateKey);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetchMajorForexFactoryNews(dateKey, false).then((res) => {
      if (!alive) return;
      setData(res);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [dateKey, enabled]);

  return {
    events: data?.events ?? [],
    hasMajorNews: data?.hasMajorNews ?? false,
    source: data?.source ?? "forexfactory-live",
    live: data?.live ?? false,
    loading,
    refresh,
  };
}
