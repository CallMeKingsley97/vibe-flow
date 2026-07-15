interface ApiErrorLike {
  code?: unknown;
  message?: unknown;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as ApiErrorLike;
    if (typeof candidate.message === "string") return candidate.message;
  }
  return "发生未知错误";
}
