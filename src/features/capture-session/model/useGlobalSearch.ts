import { useCallback, useEffect, useState } from "react";

import { searchAgentHistory } from "../../../shared/api/capture";
import type { SearchHit, SearchScope, SessionSource } from "../../../shared/contracts/capture";
import { formatError } from "../../../shared/lib/error";

export function useGlobalSearch(
  query: string,
  source: SessionSource | "all",
  workspace: string | null,
  scope: SearchScope = "all",
) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = query.trim();

  const refresh = useCallback(async () => {
    if (!trimmed) {
      setHits([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await searchAgentHistory({
        query: trimmed,
        ...(source === "all" ? {} : { source }),
        ...(workspace ? { workspace } : {}),
        scope,
        limit: 40,
      });
      setHits(result.hits);
      setError(null);
    } catch (reason) {
      setError(formatError(reason));
    } finally {
      setLoading(false);
    }
  }, [scope, source, trimmed, workspace]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void refresh();
    }, 280);
    return () => window.clearTimeout(handle);
  }, [refresh]);

  return { hits, loading, error, active: trimmed.length > 0 };
}
