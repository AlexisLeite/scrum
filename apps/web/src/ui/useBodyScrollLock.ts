import React from "react";

let activeLockCount = 0;
let originalBodyOverflow: string | null = null;

function syncBodyScrollLock() {
  if (typeof document === "undefined") {
    return;
  }

  if (activeLockCount > 0) {
    if (originalBodyOverflow === null) {
      originalBodyOverflow = document.body.style.overflow;
    }
    document.body.style.overflow = "hidden";
    return;
  }

  document.body.style.overflow = originalBodyOverflow ?? "";
  originalBodyOverflow = null;
}

function acquireBodyScrollLock() {
  activeLockCount += 1;
  syncBodyScrollLock();

  return () => {
    activeLockCount = Math.max(0, activeLockCount - 1);
    syncBodyScrollLock();
  };
}

export function useBodyScrollLock(enabled: boolean) {
  React.useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    return acquireBodyScrollLock();
  }, [enabled]);
}
