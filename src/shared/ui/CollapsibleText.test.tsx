// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CollapsibleText } from "./CollapsibleText";

describe("CollapsibleText", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  it("长内容默认折叠并支持手动展开和收起", () => {
    render(<CollapsibleText collapseAt={10} text="这是一段需要默认折叠的较长事件内容" />);

    const toggle = screen.getByRole("button", { name: /展开全文/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: /收起内容/ }).getAttribute("aria-expanded")).toBe(
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: /收起内容/ }));
    expect(screen.getByRole("button", { name: /展开全文/ })).toBeTruthy();
  });
});
