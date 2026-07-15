import type { AgentEvent } from "../../../shared/contracts/capture";

export function mergeEvents(current: AgentEvent[], incoming: AgentEvent[]): AgentEvent[] {
  const bySequence = new Map(current.map((event) => [event.sequence, event]));

  for (const event of incoming) {
    bySequence.set(event.sequence, event);
  }

  return [...bySequence.values()].sort((left, right) => left.sequence - right.sequence);
}
