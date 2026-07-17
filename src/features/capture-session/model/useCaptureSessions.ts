import { useCallback, useEffect, useRef, useState } from "react";

import { listCaptureSessions } from "../../../shared/api/capture";
import type { CaptureSession } from "../../../shared/contracts/capture";
import { formatError } from "../../../shared/lib/error";

function sessionsSignature(sessions: CaptureSession[]): string {
  return sessions
    .map(
      (session) =>
        [
          session.id,
          session.updatedAt,
          session.lastSequence,
          session.model ?? "",
          session.totalTokens ?? "",
          session.name,
        ].join(":"),
    )
    .join("|");
}

export function useCaptureSessions() {
  const [sessions, setSessions] = useState<CaptureSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const signatureRef = useRef("");

  const refresh = useCallback(async () => {
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    try {
      const next = await listCaptureSessions();
      const signature = sessionsSignature(next);
      if (signature !== signatureRef.current) {
        signatureRef.current = signature;
        setSessions(next);
      }
      hasLoadedRef.current = true;
      setError(null);
    } catch (reason) {
      setError(formatError(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sessions, loading, error, refresh };
}
