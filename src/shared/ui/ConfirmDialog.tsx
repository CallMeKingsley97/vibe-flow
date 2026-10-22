import { useEffect, useRef } from "react";

import { Icon } from "./icons";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Small modal used for destructive confirmations so the app never falls back
 * to the browser's native `window.confirm` chrome.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  tone = "default",
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={onCancel} role="presentation">
      <div
        aria-describedby="confirm-dialog-description"
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className={`dialog ${tone === "danger" ? "dialog-danger" : ""}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="dialog-icon" aria-hidden="true">
          <Icon name={tone === "danger" ? "alert" : "shield"} size={20} />
        </div>
        <div className="dialog-copy">
          <h3 id="confirm-dialog-title">{title}</h3>
          <p id="confirm-dialog-description">{description}</p>
        </div>
        <div className="dialog-actions">
          <button className="secondary-button" disabled={busy} onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button
            className={tone === "danger" ? "danger-button" : "primary-button"}
            disabled={busy}
            onClick={onConfirm}
            ref={confirmRef}
            type="button"
          >
            {busy ? "处理中…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
