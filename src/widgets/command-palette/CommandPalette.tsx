import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { searchAgentHistory } from "../../shared/api/capture";
import type { SearchHit } from "../../shared/contracts/capture";
import type { ThemePreference } from "../../features/theme/model/theme";
import { useTheme } from "../../features/theme/model/useTheme";
import { Icon, type IconName } from "../../shared/ui/icons";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenSession: (sessionId: string, eventId?: string) => void;
}

interface CommandItem {
  id: string;
  group: string;
  title: string;
  hint?: string | undefined;
  icon: IconName;
  keywords?: string | undefined;
  run: () => void;
}

const themeLabels: Record<ThemePreference, string> = {
  system: "跟随系统",
  dark: "深色",
  light: "浅色",
};

export function CommandPalette({ open, onClose, onOpenSession }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { preference, setPreference } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [hitsLoading, setHitsLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setActiveIndex(0);
      return;
    }
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setHits([]);
      setHitsLoading(false);
      return;
    }
    let cancelled = false;
    setHitsLoading(true);
    const timer = window.setTimeout(() => {
      searchAgentHistory({ query: trimmed, scope: "all", limit: 8 })
        .then((result) => {
          if (!cancelled) setHits(result.hits);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setHitsLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const commands = useMemo<CommandItem[]>(() => {
    const go = (path: string) => () => {
      void navigate(path);
      onClose();
    };
    const theme = (value: ThemePreference) => () => {
      setPreference(value);
      onClose();
    };
    return [
      {
        id: "nav-sessions",
        group: "前往",
        title: "会话",
        hint: "浏览本地 Agent 会话",
        icon: "sessions",
        keywords: "sessions 会话 dashboard",
        run: go("/"),
      },
      {
        id: "nav-insights",
        group: "前往",
        title: "洞察",
        hint: "跨 Agent 使用分析",
        icon: "insights",
        keywords: "insights 洞察 analytics",
        run: go("/insights"),
      },
      {
        id: "nav-settings",
        group: "前往",
        title: "设置",
        hint: "外观、数据保留与更新",
        icon: "settings",
        keywords: "settings 设置 preferences",
        run: go("/settings"),
      },
      {
        id: "theme-system",
        group: "外观",
        title: "跟随系统",
        hint: preference === "system" ? "当前模式" : undefined,
        icon: "monitor",
        keywords: "theme system 系统 外观",
        run: theme("system"),
      },
      {
        id: "theme-dark",
        group: "外观",
        title: "深色",
        hint: preference === "dark" ? "当前模式" : undefined,
        icon: "moon",
        keywords: "theme dark 深色 暗色",
        run: theme("dark"),
      },
      {
        id: "theme-light",
        group: "外观",
        title: "浅色",
        hint: preference === "light" ? "当前模式" : undefined,
        icon: "sun",
        keywords: "theme light 浅色 亮色",
        run: theme("light"),
      },
    ];
  }, [navigate, onClose, preference, setPreference]);

  const filteredCommands = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return commands;
    return commands.filter((command) =>
      `${command.title} ${command.hint ?? ""} ${command.keywords ?? ""}`
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [commands, query]);

  const items: CommandItem[] = useMemo(
    () => [
      ...filteredCommands,
      ...hits.map((hit): CommandItem => ({
        id: `hit-${hit.sessionId}-${hit.eventId ?? hit.kind ?? "session"}`,
        group: "会话结果",
        title: hit.sessionName,
        hint: hit.snippet,
        icon: "sessions",
        run: () => {
          onOpenSession(hit.sessionId, hit.eventId ?? undefined);
          onClose();
        },
      })),
    ],
    [filteredCommands, hits, onClose, onOpenSession],
  );

  useEffect(() => {
    setActiveIndex((current) => (items.length ? Math.min(current, items.length - 1) : 0));
  }, [items.length]);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (items.length ? (current + 1) % items.length : 0));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) =>
          items.length ? (current - 1 + items.length) % items.length : 0,
        );
      } else if (event.key === "Enter") {
        const item = items[activeIndex];
        if (item) {
          event.preventDefault();
          item.run();
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeIndex, items, onClose, open]);

  if (!open) return null;

  let renderedGroup = "";
  return (
    <div className="palette-backdrop" onClick={onClose} role="presentation">
      <div
        aria-label="命令面板"
        aria-modal="true"
        className="palette"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="palette-search">
          <Icon name="search" size={18} />
          <input
            aria-label="搜索会话或输入命令"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="搜索会话，或输入命令…"
            ref={inputRef}
            value={query}
          />
          <kbd>ESC</kbd>
        </div>

        <div className="palette-results" role="listbox">
          {items.map((item, index) => {
            const showGroup = item.group !== renderedGroup;
            if (showGroup) renderedGroup = item.group;
            return (
              <div className="palette-entry" key={item.id}>
                {showGroup ? <div className="palette-group">{item.group}</div> : null}
                <button
                  aria-selected={index === activeIndex}
                  className={`palette-item ${index === activeIndex ? "active" : ""}`}
                  onClick={item.run}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                  type="button"
                >
                  <span className="palette-item-icon">
                    <Icon name={item.icon} size={15} />
                  </span>
                  <span className="palette-item-copy">
                    <strong>{item.title}</strong>
                    {item.hint ? <small>{item.hint}</small> : null}
                  </span>
                  {item.group === "会话结果" ? (
                    <Icon className="palette-item-arrow" name="arrow-right" size={14} />
                  ) : null}
                </button>
              </div>
            );
          })}
          {!items.length ? (
            <div className="palette-empty">
              {hitsLoading ? "正在搜索…" : `没有找到与「${query.trim()}」匹配的内容`}
            </div>
          ) : null}
          {query.trim() && hitsLoading ? <div className="palette-hint">正在搜索会话…</div> : null}
        </div>

        <div className="palette-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> 选择
          </span>
          <span>
            <kbd>↵</kbd> 打开
          </span>
          <span className="palette-footer-theme">当前外观：{themeLabels[preference]}</span>
        </div>
      </div>
    </div>
  );
}
