import React from "react";
import { FiInfo } from "react-icons/fi";
import { MarkdownPreview } from "../../../ui/drawers/product-workspace/MarkdownPreview";
import { StoryItem } from "../ProductWorkspaceViewShared";

type StoryInfoPopoverProps = {
  story: StoryItem;
};

type PopoverPlacement = {
  vertical: "top" | "bottom";
  horizontal: "start" | "end";
  maxHeight: number;
  maxWidth: number;
};

export function StoryInfoPopover(props: StoryInfoPopoverProps) {
  const { story } = props;
  const [open, setOpen] = React.useState(false);
  const [placement, setPlacement] = React.useState<PopoverPlacement>({
    vertical: "bottom",
    horizontal: "end",
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

    setPlacement((current) => {
      if (
        current.vertical === vertical &&
        current.horizontal === horizontal &&
        current.maxHeight === maxHeight &&
        current.maxWidth === maxWidth
      ) {
        return current;
      }

      return { vertical, horizontal, maxHeight, maxWidth };
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
      className="story-info-popover"
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
        aria-label={`Ver informacion de ${story.title}`}
        aria-describedby={open ? panelId : undefined}
      >
        <FiInfo aria-hidden="true" focusable="false" />
      </button>
      {open ? (
        <div
          id={panelId}
          ref={panelRef}
          className="story-info-popover-panel"
          role="tooltip"
          onMouseEnter={openPopover}
          onMouseLeave={scheduleClosePopover}
          data-side={placement.vertical}
          data-align={placement.horizontal}
          style={{ maxHeight: `${placement.maxHeight}px`, maxWidth: `${placement.maxWidth}px` }}
        >
          <MarkdownPreview
            markdown={story.description}
            compact
            previewSize={400}
            className="markdown-preview-card"
            emptyLabel="Sin informacion adicional"
          />
        </div>
      ) : null}
    </div>
  );
}
