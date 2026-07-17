import { useCallback, useEffect, useRef, useState } from "react";

import { listCaptureSessions } from "../../../shared/api/capture";
import type { CaptureSession, SessionSource } from "../../../shared/contracts/capture";
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

export function useCaptureSessions(source: SessionSource | "all" = "all") {
  const [sessions, setSessions] = useState<CaptureSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const signatureRef = useRef("");
  const sourceRef = useRef(source);

  useEffect(() => {
    // 切换来源时允许重新显示 loading，并清空签名缓存
    if (sourceRef.current !== source) {
      sourceRef.current = source;
      hasLoadedRef.current = false;
      signatureRef.current = "";
      setSessions([]);
    }
  }, [source]);

  const refresh = useCallback(async () => {
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    try {
      const next = await listCaptureSessions(
        500,
        0,
        source === "all" ? undefined : source,
      );
      const signature = `${source}|${sessionsSignature(next)}`;
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
  }, [source]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sessions, loading, error, refresh };
}