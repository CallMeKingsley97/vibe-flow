import { useCallback, useEffect, useState } from "react";

import {
  getSourceScanStatuses,
  scanLocalHistory,
  subscribeHistoryChanges,
} from "../../../shared/api/capture";
import type { SourceScanStatus } from "../../../shared/contracts/capture";
import { formatError } from "../../../shared/lib/error";

export function useLocalHistory(onSessionsChanged: () => Promise<void>) {
  const [statuses, setStatuses] = useState<SourceScanStatus[]>([]);
  const [scanning, setScanning] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      setStatuses(await scanLocalHistory());
      await onSessionsChanged();
      setRevision((value) => value + 1);
      setError(null);
    } catch (reason) {
      setError(formatError(reason));
    } finally {
      setScanning(false);
    }
  }, [onSessionsChanged]);

  useEffect(() => {
    let active = true;
    void subscribeHistoryChanges(() => {
      if (!active) return;
      void onSessionsChanged();
      setRevision((value) => value + 1);
    }).catch((reason: unknown) => {
      if (active) setError(formatError(reason));
    });
    void getSourceScanStatuses().then((value) => {
      if (active) setStatuses(value);
    });
    void scan();
    return () => {
      active = false;
    };
  }, [onSessionsChanged, scan]);

  return { statuses, scanning, revision, error, scan };
}
