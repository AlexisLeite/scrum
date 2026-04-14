import React from "react";
import { createPortal } from "react-dom";
import { useOverlayEscape } from "../../useOverlayEscape";
import "./image-lightbox.css";

type ImageLightboxProps = {
  open: boolean;
  src: string;
  alt?: string;
  onClose: () => void;
};

type Point = {
  x: number;
  y: number;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.2;

export function ImageLightbox(props: ImageLightboxProps) {
  const { open, src, alt, onClose } = props;
  const shellRef = React.useRef<HTMLElement | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState<Point>({ x: 0, y: 0 });
  const [dragOrigin, setDragOrigin] = React.useState<Point | null>(null);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragOrigin(null);
  }, [open, src]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [open]);

  useOverlayEscape(onClose, open);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    closeButtonRef.current?.focus();
  }, [open, src]);

  React.useEffect(() => {
    if (!dragOrigin) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      setOffset((current) => ({
        x: current.x + event.clientX - dragOrigin.x,
        y: current.y + event.clientY - dragOrigin.y
      }));
      setDragOrigin({ x: event.clientX, y: event.clientY });
    };

    const stopDragging = () => setDragOrigin(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [dragOrigin]);

  const zoomOutDisabled = scale <= MIN_SCALE;
  const zoomInDisabled = scale >= MAX_SCALE;

  const setScaleWithinBounds = (nextScale: number) => {
    setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(nextScale.toFixed(2)))));
  };

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="image-lightbox-backdrop" onMouseDown={onClose} role="presentation">
      <section
        ref={shellRef}
        className="image-lightbox-shell"
        role="dialog"
        aria-modal="true"
        aria-label={alt?.trim() || "Imagen ampliada"}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== "Tab") {
            return;
          }

          const focusableSelectors = [
            "button:not([disabled])",
            "[href]",
            "input:not([disabled])",
            "select:not([disabled])",
            "textarea:not([disabled])",
            "[tabindex]:not([tabindex='-1'])"
          ].join(",");
          const focusableElements = Array.from(
            shellRef.current?.querySelectorAll<HTMLElement>(focusableSelectors) ?? []
          ).filter((element) => !element.hasAttribute("disabled"));

          if (focusableElements.length === 0) {
            event.preventDefault();
            shellRef.current?.focus();
            return;
          }

          const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
          const nextIndex = event.shiftKey
            ? currentIndex <= 0
              ? focusableElements.length - 1
              : currentIndex - 1
            : currentIndex < 0 || currentIndex === focusableElements.length - 1
              ? 0
              : currentIndex + 1;

          event.preventDefault();
          focusableElements[nextIndex]?.focus();
        }}
      >
        <div className="image-lightbox-toolbar" onMouseDown={(event) => event.stopPropagation()}>
          <div className="image-lightbox-meta">
            <strong>{alt?.trim() || "Imagen"}</strong>
            <span>{Math.round(scale * 100)}%</span>
          </div>
          <div className="row-actions compact image-lightbox-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setScaleWithinBounds(scale - SCALE_STEP)}
              disabled={zoomOutDisabled}
            >
              -
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setScale(1);
                setOffset({ x: 0, y: 0 });
              }}
            >
              Reset
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setScaleWithinBounds(scale + SCALE_STEP)}
              disabled={zoomInDisabled}
            >
              +
            </button>
            <button type="button" className="btn btn-secondary btn-sm" ref={closeButtonRef} onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
        <div
          className={`image-lightbox-stage ${scale > 1 ? "is-draggable" : ""}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
            }
          }}
          onWheel={(event) => {
            event.preventDefault();
            setScaleWithinBounds(scale + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP));
          }}
        >
          <img
            src={src}
            alt={alt ?? "Imagen ampliada"}
            className="image-lightbox-image"
            draggable={false}
            onMouseDown={(event) => event.stopPropagation()}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (scale <= 1) {
                return;
              }
              event.preventDefault();
              setDragOrigin({ x: event.clientX, y: event.clientY });
            }}
          />
        </div>
      </section>
    </div>,
    document.body
  );
}
