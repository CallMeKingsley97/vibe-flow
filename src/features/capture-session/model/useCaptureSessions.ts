import { useCallback, useEffect, useRef, useState } from "react";

import { listCaptureSessions, setSessionFavorite } from "../../../shared/api/capture";
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
          session.isFavorite ? "1" : "0",
        ].join(":"),
    )
    .join("|");
}

export function useCaptureSessions(
  source: SessionSource | "all" = "all",
  favoriteOnly = false,
) {
  const [sessions, setSessions] = useState<CaptureSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const signatureRef = useRef("");
  const sourceRef = useRef(source);
  const favoriteRef = useRef(favoriteOnly);

  useEffect(() => {
    if (sourceRef.current !== source || favoriteRef.current !== favoriteOnly) {
      sourceRef.current = source;
      favoriteRef.current = favoriteOnly;
      hasLoadedRef.current = false;
      signatureRef.current = "";
      setSessions([]);
    }
  }, [source, favoriteOnly]);

  const refresh = useCallback(async () => {
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    try {
      const next = await listCaptureSessions(
        500,
        0,
        source === "all" ? undefined : source,
        favoriteOnly,
      );
      const signature = `${source}|${favoriteOnly}|${sessionsSignature(next)}`;
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
  }, [source, favoriteOnly]);

  const toggleFavorite = useCallback(
    async (sessionId: string, favorite: boolean) => {
      try {
        const updated = await setSessionFavorite(sessionId, favorite);
        setSessions((current) => {
          if (favoriteOnly && !favorite) {
            return current.filter((session) => session.id !== sessionId);
          }
          return current.map((session) => (session.id === sessionId ? updated : session));
        });
        signatureRef.current = "";
        setError(null);
        return updated;
      } catch (reason) {
        setError(formatError(reason));
        throw reason;
      }
    },
    [favoriteOnly],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sessions, loading, error, refresh, toggleFavorite };
}
