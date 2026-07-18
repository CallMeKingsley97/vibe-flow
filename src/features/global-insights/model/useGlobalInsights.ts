import { useCallback, useEffect, useRef, useState } from "react";

import { getGlobalInsights, subscribeHistoryChanges } from "../../../shared/api/capture";
import type {
  GlobalInsights,
  GlobalInsightsQuery,
  SessionSource,
} from "../../../shared/contracts/capture";
import { formatError } from "../../../shared/lib/error";
import {
  rangeWindow,
  type InsightRange,
} from "../../../entities/global-insights/model/formatInsights";

const HISTORY_CHANGE_DEBOUNCE_MS = 800;

interface UseGlobalInsightsOptions {
  range: InsightRange;
  source: SessionSource | "all";
  workspace?: string | null;
  bucket: "day" | "week";
  from?: string;
  to?: string;
}

export function useGlobalInsights(options: UseGlobalInsightsOptions) {
  const [data, setData] = useState<GlobalInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const window =
        options.range === "custom" && options.from && options.to
          ? { from: options.from, to: options.to }
          : rangeWindow(options.range);
      const query: GlobalInsightsQuery = {
        from: window.from,
        to: window.to,
        bucket: options.bucket,
      };
      if (options.source !== "all") {
        query.source = options.source;
      }
      if (options.workspace) {
        query.workspace = options.workspace;
      }
      const result = await getGlobalInsights(query);
      setData(result);
      setError(null);
    } catch (reason) {
      setError(formatError(reason));
    } finally {
      setLoading(false);
    }
  }, [options.range, options.source, options.workspace, options.bucket, options.from, options.to]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        void refresh();
      }, HISTORY_CHANGE_DEBOUNCE_MS);
    };

    void subscribeHistoryChanges(() => {
      scheduleRefresh();
    });

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}
