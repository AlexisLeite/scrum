import React from "react";
import { createPortal } from "react-dom";
import { FiInfo } from "react-icons/fi";
import { MarkdownPreview } from "../ui/drawers/product-workspace/MarkdownPreview";

type TaskInfoPopoverProps = {
  task: {
    title: string;
    description: string | null;
  };
};

export function TaskInfoPopover(props: TaskInfoPopoverProps) {
  const { task } = props;
  const [open, setOpen] = React.useState(false);
  const [placement, setPlacement] = React.useState<{
    vertical: "top" | "bottom";
    horizontal: "start" | "end";
    top: number;
    left: number;
    maxHeight: number;
    maxWidth: number;
  }>({
    vertical: "bottom",
    horizontal: "end",
    top: 0,
    left: 0,
    maxHeight: 320,
    maxWidth: 420
  });
  const panelId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const closeTimeoutRef = React.useRef<number | null>(null);

  const clearCloseTimeout = React.useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const openPopover = React.useCallback(() => {
    clearCloseTimeout();
    setOpen(true);
  }, [clearCloseTimeout]);

  const scheduleClosePopover = React.useCallback(() => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimeoutRef.current = null;
    }, 90);
  }, [clearCloseTimeout]);

  const updatePlacement = React.useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const trigger = triggerRef.current;
    const panel = panelRef.current;

    if (!trigger || !panel) {
      return;
    }

    const viewportMargin = 16;
    const gap = 10;
    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const spaceBelow = window.innerHeight - triggerRect.bottom - viewportMargin - gap;
    const spaceAbove = triggerRect.top - viewportMargin - gap;
    const vertical =
      spaceBelow >= Math.min(panelRect.height, 220) || spaceBelow >= spaceAbove ? "bottom" : "top";
    const maxHeight = Math.max(120, Math.floor(vertical === "bottom" ? spaceBelow : spaceAbove));
    const spaceRight = window.innerWidth - triggerRect.left - viewportMargin;
    const spaceLeft = triggerRect.right - viewportMargin;
    const horizontal =
      spaceRight >= Math.min(panelRect.width, 280) || spaceRight >= spaceLeft ? "start" : "end";
    const maxWidth = Math.max(220, Math.floor(horizontal === "start" ? spaceRight : spaceLeft));
    const visiblePanelHeight = Math.min(panelRect.height || maxHeight, maxHeight);
    const visiblePanelWidth = Math.min(panelRect.width || maxWidth, maxWidth);
    const top = vertical === "bottom"
      ? Math.max(viewportMargin, Math.min(triggerRect.bottom + gap, window.innerHeight - viewportMargin - visiblePanelHeight))
      : Math.max(viewportMargin, triggerRect.top - gap - visiblePanelHeight);
    const alignedLeft = horizontal === "start"
      ? triggerRect.left
      : triggerRect.right - visiblePanelWidth;
    const left = Math.max(
      viewportMargin,
      Math.min(alignedLeft, window.innerWidth - viewportMargin - visiblePanelWidth)
    );

    setPlacement((current) => {
      if (
        current.vertical === vertical &&
        current.horizontal === horizontal &&
        current.top === top &&
        current.left === left &&
        current.maxHeight === maxHeight &&
        current.maxWidth === maxWidth
      ) {
        return current;
      }

      return { vertical, horizontal, top, left, maxHeight, maxWidth };
    });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) {
      return;
    }

    updatePlacement();

    const handleViewportChange = () => {
      updatePlacement();
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(handleViewportChange) : null;
    if (resizeObserver) {
      if (triggerRef.current) {
        resizeObserver.observe(triggerRef.current);
      }
      if (panelRef.current) {
        resizeObserver.observe(panelRef.current);
      }
    }

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      resizeObserver?.disconnect();
    };
  }, [open, updatePlacement]);

  React.useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className={`story-info-popover ${open ? "is-open" : ""}`.trim()}
      onMouseEnter={openPopover}
      onMouseLeave={scheduleClosePopover}
      onFocusCapture={openPopover}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }
        scheduleClosePopover();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-secondary btn-icon story-list-icon-button"
        aria-label={`Ver informacion de ${task.title}`}
        aria-describedby={open ? panelId : undefined}
      >
        <FiInfo aria-hidden="true" focusable="false" />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
          <div
            id={panelId}
            ref={panelRef}
            className="story-info-popover-panel"
            role="tooltip"
            onMouseEnter={openPopover}
            onMouseLeave={scheduleClosePopover}
            data-side={placement.vertical}
            data-align={placement.horizontal}
            style={{
              top: `${placement.top}px`,
              left: `${placement.left}px`,
              maxHeight: `${placement.maxHeight}px`,
              maxWidth: `${placement.maxWidth}px`
            }}
          >
            <MarkdownPreview
              markdown={task.description}
              compact
              previewSize={400}
              className="markdown-preview-card"
              emptyLabel="Sin informacion adicional"
            />
          </div>,
          document.body
        )
        : null}
    </div>
  );
}
