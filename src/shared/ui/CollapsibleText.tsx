import { useLayoutEffect, useRef, useState } from "react";

interface CollapsibleTextProps {
  text: string;
  collapseAt?: number;
  maxHeight?: number;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  className?: string;
}

export function CollapsibleText({
  text,
  collapseAt = 220,
  maxHeight = 72,
  expanded,
  onExpandedChange,
  className = "",
}: CollapsibleTextProps) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(() => text.length > collapseAt);
  const contentRef = useRef<HTMLDivElement>(null);
  const isExpanded = expanded ?? localExpanded;
  const collapsible = overflowing || text.length > collapseAt || text.split("\n").length > 4;

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || isExpanded) return;

    function measure() {
      if (!content) return;
      setOverflowing(content.scrollHeight > maxHeight + 1);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [isExpanded, maxHeight, text]);

  function toggle() {
    const next = !isExpanded;
    if (expanded === undefined) setLocalExpanded(next);
    onExpandedChange?.(next);
  }

  return (
    <div
      className={`collapsible-text ${collapsible ? "is-collapsible" : ""} ${isExpanded ? "is-expanded" : ""} ${className}`.trim()}
    >
      <div
        className="collapsible-text-content"
        ref={contentRef}
        style={!isExpanded ? { maxHeight } : undefined}
      >
        {text}
      </div>
      {collapsible ? (
        <button aria-expanded={isExpanded} onClick={toggle} type="button">
          {isExpanded ? "收起内容" : "展开全文"}
          <span aria-hidden="true">{isExpanded ? "↑" : "↓"}</span>
        </button>
      ) : null}
    </div>
  );
}
