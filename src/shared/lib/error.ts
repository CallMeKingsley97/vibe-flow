interface ApiErrorLike {
  code?: unknown;
  message?: unknown;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as ApiErrorLike;
    if (typeof candidate.message === "string") return candidate.message;
  }
  return "发生未知错误";
}

/** 识别浏览器预览 / 非 Tauri 环境下的 invoke 失败 */
function isDesktopBackendUnavailable(message: string): boolean {
  const normalized = message.toLowerCase();
  if (normalized.includes("invoke") && normalized.includes("undefined")) return true;
  if (normalized.includes("invoke") && normalized.includes("not a function")) return true;
  if (normalized.includes("__tauri") && normalized.includes("undefined")) return true;
  return false;
}

export function formatError(error: unknown): string {
  const message = readErrorMessage(error);
  if (isDesktopBackendUnavailable(message)) {
    return "当前未连接到桌面后端（浏览器预览模式）。请通过应用本体启动以使用扫描、设置与数据功能。";
  }
  return message;
}
