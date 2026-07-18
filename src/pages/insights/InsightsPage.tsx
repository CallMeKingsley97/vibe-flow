import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useGlobalInsights } from "../../features/global-insights/model/useGlobalInsights";
import { GlobalInsightsView } from "../../widgets/global-insights/GlobalInsights";
import type { InsightRange } from "../../entities/global-insights/model/formatInsights";
import type { SessionSource } from "../../shared/contracts/capture";

export function InsightsPage() {
  const [range, setRange] = useState<InsightRange>("30d");
  const [bucket, setBucket] = useState<"day" | "week">("day");
  const [source, setSource] = useState<SessionSource | "all">("all");
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useGlobalInsights({
    range,
    bucket,
    source,
    workspace: null,
  });

  return (
    <div className="insights-page-shell">
      <GlobalInsightsView
        bucket={bucket}
        data={data}
        error={error}
        loading={loading}
        onBucketChange={setBucket}
        onProjectClick={(workspace) => {
          const params = new URLSearchParams({ workspace });
          void navigate(`/?${params.toString()}`);
        }}
        onRangeChange={setRange}
        onRefresh={() => void refresh()}
        onSourceChange={setSource}
        range={range}
        source={source}
        workspace={null}
      />
    </div>
  );
}
