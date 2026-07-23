import { describe, expect, it } from "vitest";

import { formatError } from "./error";

describe("formatError", () => {
  it("keeps ordinary error messages", () => {
    expect(formatError(new Error("扫描失败"))).toBe("扫描失败");
    expect(formatError("保存超时")).toBe("保存超时");
  });

  it("maps browser Tauri invoke failures to a friendly desktop message", () => {
    expect(formatError(new Error("Cannot read properties of undefined (reading 'invoke')"))).toContain(
      "桌面后端",
    );
  });
});
