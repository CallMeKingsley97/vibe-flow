import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "sessions"
  | "insights"
  | "settings"
  | "search"
  | "command"
  | "star"
  | "star-filled"
  | "sort-desc"
  | "sort-asc"
  | "refresh"
  | "chevron-down"
  | "chevron-right"
  | "arrow-right"
  | "check"
  | "close"
  | "plus"
  | "minus"
  | "alert"
  | "shield"
  | "terminal"
  | "file"
  | "tool"
  | "sparkles"
  | "sun"
  | "moon"
  | "monitor"
  | "database"
  | "folder"
  | "clock"
  | "activity"
  | "filter"
  | "fold"
  | "layers"
  | "cpu"
  | "user";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

/**
 * Stroke-based icon set (24×24 viewBox, 1.75 stroke). Kept inline so the app
 * ships no icon-font or runtime dependency and every glyph stays consistent.
 */
const paths: Record<IconName, ReactNode> = {
  sessions: (
    <>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H9l-4 3.5V6.5Z" />
      <path d="M8 8.5h8M8 11.5h5" />
    </>
  ),
  insights: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.96 4.6a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  command: <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6Z" />,
  star: <path d="m12 3.6 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6L3.2 10l6.1-.9L12 3.6Z" />,
  "star-filled": (
    <path
      d="m12 3.6 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6L3.2 10l6.1-.9L12 3.6Z"
      fill="currentColor"
      stroke="currentColor"
      strokeLinejoin="round"
    />
  ),
  "sort-desc": (
    <>
      <path d="M4 6h7M4 11h5M4 16h3" />
      <path d="M17 5v14M17 19l-3-3M17 19l3-3" />
    </>
  ),
  "sort-asc": (
    <>
      <path d="M4 6h3M4 11h5M4 16h7" />
      <path d="M17 19V5M17 5l-3 3M17 5l3 3" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11.5A8 8 0 0 0 6.2 6.2L4 8.5" />
      <path d="M4 4.5v4h4" />
      <path d="M4 12.5a8 8 0 0 0 13.8 5.3L20 15.5" />
      <path d="M20 19.5v-4h-4" />
    </>
  ),
  "chevron-down": <path d="m6 9.5 6 6 6-6" />,
  "chevron-right": <path d="m9.5 6 6 6-6 6" />,
  "arrow-right": (
    <>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  alert: (
    <>
      <path d="M12 3.5 22 20H2L12 3.5Z" />
      <path d="M12 9.5v4.5M12 17.2v.1" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2.5 20 6v5.5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6l8-3.5Z" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="m7 9.5 3 3-3 3M12.5 15.5h4" />
    </>
  ),
  file: (
    <>
      <path d="M6 3.5h7l5 5v12H6v-17Z" />
      <path d="M13 3.5v5h5" />
    </>
  ),
  tool: (
    <path d="M14.5 6.5a4.5 4.5 0 0 0 5.8 5.8l-9 9a2.8 2.8 0 0 1-4-4l9-9a4.5 4.5 0 0 0-1.8-1.8Z" />
  ),
  sparkles: (
    <>
      <path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z" />
      <path d="m18.5 15 .9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2.5" />
      <path d="M8.5 21h7M12 17v4" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
      <path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
    </>
  ),
  folder: (
    <path d="M3.5 7A2.5 2.5 0 0 1 6 4.5h4l2 2.5h6A2.5 2.5 0 0 1 20.5 9.5v7A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5V7Z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  activity: <path d="M2.5 12h4l2.5-6 4 12 2.5-6h6" />,
  filter: <path d="M3.5 5.5h17l-6.5 7.5v6l-4-2v-4L3.5 5.5Z" />,
  fold: (
    <>
      <path d="M4 6h16M4 18h16" />
      <path d="m9 10 3 3 3-3" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12.5 9 5 9-5M3 17l9 5 9-5" />
    </>
  ),
  cpu: (
    <>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
      <path d="M9.5 2.5v4M14.5 2.5v4M9.5 17.5v4M14.5 17.5v4M2.5 9.5h4M2.5 14.5h4M17.5 9.5h4M17.5 14.5h4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" />
    </>
  ),
};

export function Icon({ name, size = 16, className = "", ...rest }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={`icon ${className}`.trim()}
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
      width={size}
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
