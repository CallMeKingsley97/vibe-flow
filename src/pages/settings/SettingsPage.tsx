import { type FormEvent, useEffect, useState } from "react";

import packageJson from "../../../package.json";
import { useDataGovernance } from "../../features/data-retention/model/useDataGovernance";
import { checkForUpdate, installAvailableUpdate } from "../../shared/api/capture";
import type { UpdateCheck } from "../../shared/contracts/capture";
import { formatError } from "../../shared/lib/error";
import { CollapsibleText } from "../../shared/ui/CollapsibleText";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { Icon } from "../../shared/ui/icons";
import { RetentionSettingsCard } from "../../widgets/data-retention/RetentionSettingsCard";
import { ThemeSettingsCard } from "../../widgets/theme-settings/ThemeSettingsCard";

type PendingAction =
  | { kind: "cleanup"; sessionCount: number; eventCount: number }
  | { kind: "update"; version: string };

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function SettingsPage() {
  const model = useDataGovernance();
  const [retentionDays, setRetentionDays] = useState(30);
  const [autoCleanup, setAutoCleanup] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateCheck | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    if (!model.settings) return;
    setRetentionDays(model.settings.retentionDays);
    setAutoCleanup(model.settings.autoCleanup);
  }, [model.settings]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    try {
      await model.save({ retentionDays, autoCleanup });
      setNotice(
        "设置已保存。自动清理启用后，会在保存设置和应用启动时删除超过保留周期的本地会话副本。",
      );
    } catch {
      // The governance hook surfaces the message through `model.error`.
    }
  }

  async function handleCleanup() {
    try {
      const preview = model.preview ?? (await model.inspect(retentionDays));
      if (!preview.sessionCount) {
        setNotice("没有超过当前保留周期的可清理 Agent 会话。");
        return;
      }
      setPending({
        kind: "cleanup",
        sessionCount: preview.sessionCount,
        eventCount: preview.eventCount,
      });
    } catch {
      // The governance hook surfaces the message through `model.error`.
    }
  }

  async function handleDiagnose() {
    try {
      const path = await model.diagnose();
      setNotice(`安全诊断包已生成：${path}`);
    } catch {
      // The governance hook surfaces the message through `model.error`.
    }
  }

  async function handleCheckForUpdate() {
    setUpdateBusy(true);
    setUpdateError(null);
    try {
      const result = await checkForUpdate();
      setUpdate(result);
      if (!result.available) setNotice(`当前 ${result.currentVersion} 已是最新版本。`);
    } catch (error) {
      setUpdateError(formatError(error));
    } finally {
      setUpdateBusy(false);
    }
  }

  function handleInstallUpdate() {
    if (!update?.available || !update.version) return;
    setPending({ kind: "update", version: update.version });
  }

  async function runPendingAction() {
    if (!pending) return;
    setConfirmBusy(true);
    if (pending.kind === "cleanup") {
      try {
        const result = await model.cleanup(retentionDays);
        setNotice(
          `已删除 ${result.deletedSessions} 个会话，数据库回收 ${bytes(result.reclaimedDatabaseBytes)}。`,
        );
      } catch {
        // The governance hook surfaces the message through `model.error`.
      } finally {
        setConfirmBusy(false);
        setPending(null);
      }
      return;
    }

    setPending(null);
    setUpdateBusy(true);
    setUpdateError(null);
    try {
      const installed = await installAvailableUpdate();
      if (!installed) {
        setNotice("更新已被其他客户端安装或当前已是最新版本。");
        setUpdateBusy(false);
      }
    } catch (error) {
      setUpdateError(formatError(error));
      setUpdateBusy(false);
    } finally {
      setConfirmBusy(false);
    }
  }

  if (model.loading) return <div className="panel settings-loading">正在加载 Agent 数据设置…</div>;

  return (
    <div className="settings-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">PREFERENCES</span>
          <h2>设置</h2>
          <p>管理界面外观、本地 Agent 数据、更新和安全诊断信息。</p>
        </div>
      </header>
      {model.error ? (
        <div className="error-banner" role="alert">
          {model.error}
        </div>
      ) : null}
      {notice ? (
        <div className="success-banner" role="status">
          {notice}
        </div>
      ) : null}

      <form className="settings-grid" onSubmit={(event) => void handleSave(event)}>
        <ThemeSettingsCard />

        <RetentionSettingsCard
          retentionDays={retentionDays}
          autoCleanup={autoCleanup}
          busy={model.busy}
          preview={model.preview}
          onRetentionChange={(value) => {
            setRetentionDays(value);
            setNotice(null);
          }}
          onAutoCleanupChange={(value) => {
            setAutoCleanup(value);
            setNotice(null);
          }}
          onInspect={() => void model.inspect(retentionDays)}
          onCleanup={() => void handleCleanup()}
        />

        <section className="panel settings-card">
          <div className="settings-card-header">
            <div className="card-heading">
              <span className="section-icon">
                <Icon name="database" size={15} />
              </span>
              <div>
                <h3>存储与诊断</h3>
                <p>诊断包默认不包含消息正文、工具参数或 Agent 原始文件。</p>
              </div>
            </div>
          </div>
          {model.stats ? (
            <dl className="storage-grid">
              <div>
                <dt>数据库占用</dt>
                <dd>{bytes(model.stats.databaseBytes)}</dd>
              </div>
              <div>
                <dt>Agent 会话</dt>
                <dd>{model.stats.sessionCount}</dd>
              </div>
              <div>
                <dt>Agent 事件</dt>
                <dd>{model.stats.eventCount}</dd>
              </div>
              <div>
                <dt>最早会话</dt>
                <dd>
                  {model.stats.oldestSessionAt
                    ? new Date(model.stats.oldestSessionAt).toLocaleDateString("zh-CN")
                    : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <div className="empty-state">存储统计不可用</div>
          )}
          <button
            className="secondary-button icon-text-button"
            disabled={model.busy}
            onClick={() => void handleDiagnose()}
            type="button"
          >
            <Icon name="file" size={14} />
            生成安全诊断包
          </button>
        </section>

        <section className="panel settings-card capability-card">
          <div className="settings-card-header">
            <div className="card-heading">
              <span className="section-icon">
                <Icon name="layers" size={15} />
              </span>
              <div>
                <h3>数据来源与边界</h3>
                <p>Vibe Flow 只观察 Agent 自身公开记录的内容。</p>
              </div>
            </div>
          </div>
          <ul className="capability-list">
            <li>
              <span className="capability-ok">自动</span>
              <div>
                <strong>本地历史发现</strong>
                <small>自动读取并监听 Codex、Claude、Gemini 和 Cursor 会话。</small>
              </div>
            </li>
            <li>
              <span className="capability-ok">只读</span>
              <div>
                <strong>原始文件保护</strong>
                <small>扫描、统计和清理都不会修改 Agent 原始历史文件。</small>
              </div>
            </li>
            <li>
              <span className="capability-ok">本地</span>
              <div>
                <strong>执行统计</strong>
                <small>根据消息、Skill、MCP、工具、命令、文件和错误事件生成。</small>
              </div>
            </li>
            <li>
              <span className="capability-limited">不采集</span>
              <div>
                <strong>网络与系统流量</strong>
                <small>不启动代理、不修改系统网络设置，也不读取其他应用流量。</small>
              </div>
            </li>
          </ul>
        </section>

        <section className="panel settings-card update-card">
          <div className="settings-card-header">
            <div className="card-heading">
              <span className="section-icon">
                <Icon name="refresh" size={15} />
              </span>
              <div>
                <h3>版本与更新</h3>
                <p>更新包必须通过项目公钥签名验证后才能安装。</p>
              </div>
            </div>
          </div>
          <div className="update-status">
            <span>当前版本</span>
            <strong>{update?.currentVersion ?? packageJson.version}</strong>
          </div>
          {update?.available ? (
            <div className="update-available" role="status">
              <strong>发现新版本 {update.version}</strong>
              {update.body ? (
                <CollapsibleText
                  className="update-release-notes"
                  collapseAt={260}
                  maxHeight={76}
                  text={update.body}
                />
              ) : null}
            </div>
          ) : null}
          {updateError ? <div className="update-error">{updateError}</div> : null}
          <div className="update-actions">
            <button
              className="secondary-button icon-text-button"
              disabled={updateBusy}
              onClick={() => void handleCheckForUpdate()}
              type="button"
            >
              <Icon name="refresh" size={14} />
              {updateBusy ? "正在检查…" : "检查更新"}
            </button>
            {update?.available ? (
              <button
                className="primary-button icon-text-button"
                disabled={updateBusy}
                onClick={handleInstallUpdate}
                type="button"
              >
                <Icon name="arrow-right" size={14} />
                下载、验证并安装
              </button>
            ) : null}
          </div>
        </section>

        <div className="settings-savebar">
          <span>设置只影响 Vibe Flow 的本地数据副本。</span>
          <button className="primary-button icon-text-button" disabled={model.busy} type="submit">
            <Icon name="check" size={14} />
            {model.busy ? "处理中…" : "保存设置"}
          </button>
        </div>
      </form>

      <ConfirmDialog
        busy={confirmBusy}
        confirmLabel={pending?.kind === "update" ? "安装并重启" : "确认删除"}
        description={
          pending?.kind === "cleanup"
            ? `将删除 ${pending.sessionCount} 个 Agent 会话和 ${pending.eventCount} 个事件。此操作不可撤销，但不会修改 Agent 的原始历史文件。`
            : pending?.kind === "update"
              ? `安装 Vibe Flow ${pending.version} 并重启应用？更新包会先通过公钥签名验证。`
              : ""
        }
        onCancel={() => setPending(null)}
        onConfirm={() => void runPendingAction()}
        open={pending !== null}
        title={pending?.kind === "update" ? "安装更新" : "清理本地数据"}
        tone="danger"
      />
    </div>
  );
}
