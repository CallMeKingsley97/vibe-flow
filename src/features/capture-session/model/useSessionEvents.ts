import { useEffect, useRef, useState } from "react";

import { mergeEvents } from "../../../entities/agent-event/model/mergeEvents";
import { listAgentEvents } from "../../../shared/api/capture";
import type { AgentEvent } from "../../../shared/contracts/capture";
import { formatError } from "../../../shared/lib/error";

export function useSessionEvents(sessionId: string | null, revision = 0) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    setEvents([]);
    setError(null);

    if (!sessionId) return;

    setLoading(true);
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

      if (generation.current === currentGeneration) {
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
