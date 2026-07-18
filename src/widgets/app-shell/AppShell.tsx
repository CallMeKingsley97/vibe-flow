import { NavLink, Outlet } from "react-router-dom";

import { useBackendHealth } from "../../shared/hooks/useBackendHealth";

export function AppShell() {
  const health = useBackendHealth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <h1>Vibe Flow</h1>
        </div>
        <nav className="main-nav" aria-label="主导航">
          <NavLink end to="/">
            会话
          </NavLink>
          <NavLink to="/insights">洞察</NavLink>
          <NavLink to="/settings">设置</NavLink>
        </nav>
        <div className="health" title={health.error ?? undefined}>
          <span className={`health-dot ${health.data ? "online" : ""}`} />
          {health.data
            ? `Rust ${health.data.version} · SQLite ${health.data.database}`
            : health.error
              ? "后端不可用"
              : "正在连接后端"}
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
    </div>
  );
}
