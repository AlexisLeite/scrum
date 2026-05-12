type MermaidViewBox = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type MermaidPanDragState = {
  origin: MermaidViewBox;
  pointerId: number;
  startX: number;
  startY: number;
  viewportHeight: number;
  viewportWidth: number;
};

const MIN_MERMAID_ZOOM = 0.5;
const MAX_MERMAID_ZOOM = 8;
const MERMAID_WHEEL_ZOOM_SPEED = 0.0015;

export type MermaidPanZoomController = {
  destroy: () => void;
  reset: () => void;
};

export function createMermaidPanZoomController(viewport: HTMLElement, content: HTMLElement): MermaidPanZoomController {
  let currentSvg: SVGSVGElement | null = null;
  let baseViewBox: MermaidViewBox | null = null;
  let currentViewBox: MermaidViewBox | null = null;
  let dragState: MermaidPanDragState | null = null;

  const reset = () => {
    dragState = null;
    viewport.classList.remove("is-panning");
    const svg = resolveRenderedSvg(content);
    if (!svg) {
      currentSvg = null;
      baseViewBox = null;
      currentViewBox = null;
      return;
    }

    if (svg !== currentSvg || !baseViewBox) {
      currentSvg = svg;
      baseViewBox = readSvgViewBox(svg);
      prepareSvgForPanZoom(svg);
    }

    currentViewBox = { ...baseViewBox };
    applyViewBox(svg, currentViewBox);
  };

  const ensureViewBox = () => {
    const svg = resolveRenderedSvg(content);
    if (!svg) {
      currentSvg = null;
      baseViewBox = null;
      currentViewBox = null;
      return false;
    }

    if (svg !== currentSvg || !baseViewBox || !currentViewBox) {
      currentSvg = svg;
      baseViewBox = readSvgViewBox(svg);
      currentViewBox = { ...baseViewBox };
      prepareSvgForPanZoom(svg);
      applyViewBox(svg, currentViewBox);
    }

    return true;
  };

  const handleWheel = (event: WheelEvent) => {
    if (!ensureViewBox() || !currentSvg || !baseViewBox || !currentViewBox) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const currentZoom = baseViewBox.width / currentViewBox.width;
    const normalizedDelta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
    const nextZoom = clampNumber(
      currentZoom * Math.exp(-normalizedDelta * MERMAID_WHEEL_ZOOM_SPEED),
      MIN_MERMAID_ZOOM,
      MAX_MERMAID_ZOOM
    );
    if (nextZoom === currentZoom) {
      return;
    }

    const pointer = resolvePointerViewBoxPoint(event, currentViewBox);
    const nextWidth = baseViewBox.width / nextZoom;
    const nextHeight = baseViewBox.height / nextZoom;
    const pointerRatioX = (pointer.x - currentViewBox.x) / currentViewBox.width;
    const pointerRatioY = (pointer.y - currentViewBox.y) / currentViewBox.height;
    currentViewBox = {
      x: pointer.x - pointerRatioX * nextWidth,
      y: pointer.y - pointerRatioY * nextHeight,
      width: nextWidth,
      height: nextHeight
    };
    applyViewBox(currentSvg, currentViewBox);
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !ensureViewBox() || !currentViewBox) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const viewportRect = viewport.getBoundingClientRect();
    dragState = {
      origin: { ...currentViewBox },
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewportHeight: Math.max(1, viewportRect.height),
      viewportWidth: Math.max(1, viewportRect.width)
    };
    viewport.classList.add("is-panning");
    viewport.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!dragState || dragState.pointerId !== event.pointerId || !currentSvg) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    currentViewBox = {
      ...dragState.origin,
      x: dragState.origin.x - ((event.clientX - dragState.startX) * dragState.origin.width) / dragState.viewportWidth,
      y: dragState.origin.y - ((event.clientY - dragState.startY) * dragState.origin.height) / dragState.viewportHeight
    };
    applyViewBox(currentSvg, currentViewBox);
  };

  const finishDrag = (event: PointerEvent) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragState = null;
    viewport.classList.remove("is-panning");
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
  };

  const stopExternalScroll = (event: Event) => {
    if (!resolveRenderedSvg(content)) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }
    event.stopPropagation();
  };

  viewport.classList.add("is-pan-zoom-enabled");
  reset();

  viewport.addEventListener("wheel", handleWheel, { passive: false });
  viewport.addEventListener("pointerdown", handlePointerDown);
  viewport.addEventListener("pointermove", handlePointerMove);
  viewport.addEventListener("pointerup", finishDrag);
  viewport.addEventListener("pointercancel", finishDrag);
  viewport.addEventListener("scroll", stopExternalScroll);

  return {
    destroy: () => {
      viewport.removeEventListener("wheel", handleWheel);
      viewport.removeEventListener("pointerdown", handlePointerDown);
      viewport.removeEventListener("pointermove", handlePointerMove);
      viewport.removeEventListener("pointerup", finishDrag);
      viewport.removeEventListener("pointercancel", finishDrag);
      viewport.removeEventListener("scroll", stopExternalScroll);
      viewport.classList.remove("is-pan-zoom-enabled", "is-panning");
    },
    reset
  };

  function resolvePointerViewBoxPoint(event: MouseEvent | PointerEvent, box: MermaidViewBox) {
    const viewportRect = viewport.getBoundingClientRect();
    const ratioX = viewportRect.width > 0 ? clampNumber((event.clientX - viewportRect.left) / viewportRect.width, 0, 1) : 0.5;
    const ratioY = viewportRect.height > 0 ? clampNumber((event.clientY - viewportRect.top) / viewportRect.height, 0, 1) : 0.5;
    return {
      x: box.x + ratioX * box.width,
      y: box.y + ratioY * box.height
    };
  }
}

function resolveRenderedSvg(content: HTMLElement) {
  return content.querySelector("svg") as SVGSVGElement | null;
}

function prepareSvgForPanZoom(svg: SVGSVGElement) {
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.maxWidth = "none";
}

function applyViewBox(svg: SVGSVGElement, box: MermaidViewBox) {
  svg.setAttribute("viewBox", `${formatViewBoxNumber(box.x)} ${formatViewBoxNumber(box.y)} ${formatViewBoxNumber(box.width)} ${formatViewBoxNumber(box.height)}`);
}

function readSvgViewBox(svg: SVGSVGElement): MermaidViewBox {
  const parsedViewBox = parseViewBoxAttribute(svg.getAttribute("viewBox"));
  if (parsedViewBox) {
    return parsedViewBox;
  }

  const viewBox = svg.viewBox.baseVal;
  if (viewBox.width > 0 && viewBox.height > 0) {
    return {
      x: viewBox.x,
      y: viewBox.y,
      width: viewBox.width,
      height: viewBox.height
    };
  }

  const width = readSvgNumericLength(svg.getAttribute("width")) ?? Math.max(1, svg.getBoundingClientRect().width);
  const height = readSvgNumericLength(svg.getAttribute("height")) ?? Math.max(1, svg.getBoundingClientRect().height);
  return {
    x: 0,
    y: 0,
    width,
    height
  };
}

function parseViewBoxAttribute(value: string | null): MermaidViewBox | null {
  const numbers = (value ?? "")
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number(part));
  if (numbers.length !== 4 || numbers.some((part) => !Number.isFinite(part)) || numbers[2] <= 0 || numbers[3] <= 0) {
    return null;
  }
  return {
    x: numbers[0],
    y: numbers[1],
    width: numbers[2],
    height: numbers[3]
  };
}

function readSvgNumericLength(value: string | null) {
  if (!value) {
    return null;
  }
  const match = /^-?\d+(?:\.\d+)?/.exec(value.trim());
  if (!match) {
    return null;
  }
  const numberValue = Number(match[0]);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function formatViewBoxNumber(value: number) {
  return Number(value.toFixed(3)).toString();
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
