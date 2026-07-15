import { useEffect, useState } from "react";

import { healthCheck } from "../api/capture";
import type { HealthCheck } from "../contracts/capture";
import { formatError } from "../lib/error";

interface HealthState {
  data: HealthCheck | null;
  error: string | null;
}

export function useBackendHealth(): HealthState {
  const [state, setState] = useState<HealthState>({ data: null, error: null });

  useEffect(() => {
    let active = true;

    void healthCheck()
      .then((data) => {
        if (active) setState({ data, error: null });
      })
      .catch((error: unknown) => {
        if (active) setState({ data: null, error: formatError(error) });
      });

    return () => {
      active = false;
    };
  }, []);

  return state;
}
