import type { SessionSource } from "../contracts/capture";

export const sessionSourceLabels: Record<SessionSource, string> = {
  codex: "Codex",
  claude: "Claude",
  gemini: "Gemini",
  cursor: "Cursor",
};
