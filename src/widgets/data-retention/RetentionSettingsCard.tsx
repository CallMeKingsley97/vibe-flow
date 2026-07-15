import type { CleanupPreview } from "../../shared/contracts/capture";

interface RetentionSettingsCardProps {
  retentionDays: number;
  autoCleanup: boolean;
  busy: boolean;
  preview: CleanupPreview | null;
  onRetentionChange: (value: number) => void;
  onAutoCleanupChange: (value: boolean) => void;
  onInspect: () => void;
  onCleanup: () => void;
}

export function RetentionSettingsCard({
  retentionDays,
  autoCleanup,
  busy,
  preview,
  onRetentionChange,
  onAutoCleanupChange,
  onInspect,
  onCleanup,
}: RetentionSettingsCardProps) {
  function updateRetention(value: number) {
    onRetentionChange(Math.min(3650, Math.max(1, value)));
  }

  return (
    <section className="panel settings-card retention-settings-card">
      <div className="settings-card-header">
        <div>
          <h3>保留与清理</h3>
          <p>只清理 Vibe Flow 的本地副本，不修改 Agent 的原始历史文件。</p>
        </div>
      </div>
      <div className="settings-control-grid">
        <label className="settings-control retention-control">
          <span>
            <strong>数据保留天数</strong>
            <small>仅影响 Vibe Flow 保存的索引和事件副本，范围 1–3650 天。</small>
          </span>
          <div className="number-stepper">
            <input
              aria-label="数据保留天数"
              min="1"
              max="3650"
              value={retentionDays}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) updateRetention(value);
              }}
              type="number"
            />
            <span>
              <button
                aria-label="增加一天"
                onClick={() => updateRetention(retentionDays + 1)}
                type="button"
              >
                +
              </button>
              <button
                aria-label="减少一天"
                onClick={() => updateRetention(retentionDays - 1)}
                type="button"
              >
                −
              </button>
            </span>
          </div>
        </label>
        <label className="settings-control settings-switch">
          <span>
            <strong>自动清理</strong>
            <small>应用启动和保存设置后，清理超过保留周期的数据副本。</small>
          </span>
          <input
            checked={autoCleanup}
            onChange={(event) => onAutoCleanupChange(event.target.checked)}
            type="checkbox"
          />
          <span aria-hidden="true" className="settings-switch-track">
            <i />
          </span>
        </label>
      </div>
      <div className="cleanup-actions">
        <button className="secondary-button" disabled={busy} onClick={onInspect} type="button">
          预览清理
        </button>
        <button className="danger-button" disabled={busy} onClick={onCleanup} type="button">
          执行清理
        </button>
      </div>
      {preview ? (
        <div className="cleanup-preview" role="status">
          将删除 {preview.sessionCount} 个会话和 {preview.eventCount} 个 Agent 事件。
        </div>
      ) : null}
    </section>
  );
}
