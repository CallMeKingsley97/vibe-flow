import { useEffect, useRef, useState } from "react";

import { mergeEvents } from "../../../entities/agent-event/model/mergeEvents";
import { listAgentEvents } from "../../../shared/api/capture";
import type { AgentEvent } from "../../../shared/contracts/capture";
import { formatError } from "../../../shared/lib/error";

function eventsSignature(events: AgentEvent[]): string {
  const last = events.at(-1);
  if (!last) return "0";
  return `${events.length}:${last.sequence}:${last.timestamp}:${last.summary}`;
}

export function useSessionEvents(sessionId: string | null, revision = 0) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const loadedSessionRef = useRef<string | null>(null);
  const signatureRef = useRef("");

  useEffect(() => {
    const currentGeneration = ++generation.current;
    const sessionChanged = loadedSessionRef.current !== sessionId;
    setError(null);

    if (!sessionId) {
      loadedSessionRef.current = null;
      signatureRef.current = "";
      setEvents([]);
      setLoading(false);
      return;
    }

    if (sessionChanged) {
      loadedSessionRef.current = sessionId;
      signatureRef.current = "";
      setEvents([]);
      setLoading(true);
    }

    void (async () => {
      let afterSequence = 0;
      let history: AgentEvent[] = [];

      while (true) {
        const page = await listAgentEvents(sessionId, afterSequence, 500);
        if (page.length === 0) break;
        history = mergeEvents(history, page);
        afterSequence = page.at(-1)?.sequence ?? afterSequence;
        if (page.length < 500) break;
      }

      if (generation.current !== currentGeneration) return;
      const signature = eventsSignature(history);
      if (signature !== signatureRef.current) {
        signatureRef.current = signature;
        setEvents(history);
      }
    })()
      .catch((reason: unknown) => {
        if (generation.current === currentGeneration) setError(formatError(reason));
      })
      .finally(() => {
        if (generation.current === currentGeneration) setLoading(false);
      });

    return () => {
      generation.current += 1;
    };
  }, [revision, sessionId]);

  return { events, loading, error };
}
