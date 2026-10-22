import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useTheme } from "../../features/theme/model/useTheme";
import { useBackendHealth } from "../../shared/hooks/useBackendHealth";
import { Icon, type IconName } from "../../shared/ui/icons";
import { CommandPalette } from "../command-palette/CommandPalette";

const navItems: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = [
  { to: "/", label: "会话", icon: "sessions", end: true },
  { to: "/insights", label: "洞察", icon: "insights" },
  { to: "/settings", label: "设置", icon: "settings" },
];

export function AppShell() {
  const health = useBackendHealth();
  const navigate = useNavigate();
  const { resolvedTheme, setPreference } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  function openSession(sessionId: string, eventId?: string) {
    const params = new URLSearchParams({ session: sessionId });
    if (eventId) params.set("event", eventId);
    void navigate(`/?${params.toString()}`);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="activity" size={15} />
          </span>
          <h1>Vibe Flow</h1>
        </div>

        <nav className="main-nav" aria-label="主导航">
          {navItems.map((item) => (
            <NavLink end={item.end ?? false} key={item.to} to={item.to}>
              <Icon name={item.icon} size={15} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="topbar-actions">
          <button
            aria-label="打开命令面板"
            className="command-trigger"
            onClick={() => setPaletteOpen(true)}
            type="button"
          >
            <Icon name="search" size={14} />
            <span>搜索</span>
            <kbd>⌘K</kbd>
          </button>
          <button
            aria-label={resolvedTheme === "dark" ? "切换到浅色外观" : "切换到深色外观"}
            className="icon-button"
            onClick={() => setPreference(resolvedTheme === "dark" ? "light" : "dark")}
            title={resolvedTheme === "dark" ? "切换到浅色外观" : "切换到深色外观"}
            type="button"
          >
            <Icon name={resolvedTheme === "dark" ? "sun" : "moon"} size={16} />
          </button>
          <div
            className="health"
            title={
              health.data
                ? `Rust ${health.data.version} · SQLite ${health.data.database}`
                : (health.error ?? undefined)
            }
          >
            <span className={`health-dot ${health.data ? "online" : ""}`} />
            <span className="health-label">
              {health.data ? "已连接" : health.error ? "后端不可用" : "连接中"}
            </span>
          </div>
        </div>
      </header>

      {health.error ? (
        <div className="backend-offline" role="alert">
          后端连接已断开：页面仍可浏览当前内容，但刷新、扫描和设置操作暂不可用。
        </div>
      ) : null}
      {health.data?.recoveredDatabasePath ? (
        <div className="recovery-banner" role="status">
          检测到损坏的本地数据库，已自动创建新数据库。旧文件已备份到：
          <code>{health.data.recoveredDatabasePath}</code>
        </div>
      ) : null}

      <main className="content">
        <Outlet />
      </main>

      <CommandPalette
        onClose={() => setPaletteOpen(false)}
        onOpenSession={openSession}
        open={paletteOpen}
      />
    </div>
  );
}
