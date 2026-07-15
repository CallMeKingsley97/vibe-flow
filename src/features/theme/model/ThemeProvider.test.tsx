// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "./ThemeProvider";
import { useTheme } from "./useTheme";

function ThemeProbe() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  return (
    <div>
      <span>{`${preference}:${resolvedTheme}`}</span>
      <button onClick={() => setPreference("light")} type="button">
        浅色
      </button>
      <button onClick={() => setPreference("system")} type="button">
        系统
      </button>
    </div>
  );
}

describe("ThemeProvider", () => {
  let listener: (() => void) | undefined;
  let systemPrefersDark = true;
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => {
          storage = {};
        },
        getItem: (key: string) => storage[key] ?? null,
        key: (index: number) => Object.keys(storage)[index] ?? null,
        get length() {
          return Object.keys(storage).length;
        },
        removeItem: (key: string) => {
          delete storage[key];
        },
        setItem: (key: string, value: string) => {
          storage[key] = value;
        },
      } satisfies Storage,
    });
    document.documentElement.removeAttribute("data-theme");
    vi.stubGlobal("matchMedia", () => ({
      matches: systemPrefersDark,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: (_type: string, next: () => void) => {
        listener = next;
      },
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    listener = undefined;
    systemPrefersDark = true;
    vi.unstubAllGlobals();
  });

  it("持久化主题选择并响应系统主题变化", () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByText("system:dark")).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe("dark");

    fireEvent.click(screen.getByText("浅色"));
    expect(screen.getByText("light:light")).toBeTruthy();
    expect(window.localStorage.getItem("vibe-flow.theme")).toBe("light");

    fireEvent.click(screen.getByText("系统"));
    systemPrefersDark = false;
    act(() => listener?.());
    expect(screen.getByText("system:light")).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
