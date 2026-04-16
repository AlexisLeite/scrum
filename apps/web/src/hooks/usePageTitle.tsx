import React from "react";
import { formatPageTitle } from "../lib/page-title";

type PageTitleEntry = {
  id: string;
  title: string;
};

type PageTitleContextValue = {
  setOverride: (id: string, title: string | null | undefined) => void;
};

const PageTitleContext = React.createContext<PageTitleContextValue | null>(null);

function normalizeTitle(title: string | null | undefined): string | null {
  const value = title?.trim();
  return value ? value : null;
}

export function PageTitleProvider({
  fallbackTitle,
  children
}: {
  fallbackTitle: string;
  children: React.ReactNode;
}) {
  const [entries, setEntries] = React.useState<PageTitleEntry[]>([]);

  const setOverride = React.useCallback((id: string, title: string | null | undefined) => {
    const normalizedTitle = normalizeTitle(title);
    setEntries((current) => {
      const next = current.filter((entry) => entry.id !== id);
      return normalizedTitle ? [...next, { id, title: normalizedTitle }] : next;
    });
  }, []);

  const activeTitle = entries.length > 0 ? entries[entries.length - 1]?.title ?? fallbackTitle : fallbackTitle;

  React.useEffect(() => {
    document.title = formatPageTitle(activeTitle);
  }, [activeTitle]);

  const contextValue = React.useMemo<PageTitleContextValue>(
    () => ({ setOverride }),
    [setOverride]
  );

  return (
    <PageTitleContext.Provider value={contextValue}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function usePageTitle(title: string | null | undefined) {
  const context = React.useContext(PageTitleContext);
  const id = React.useId();

  React.useEffect(() => {
    if (!context) {
      document.title = formatPageTitle(title);
      return undefined;
    }

    context.setOverride(id, title);
    return () => {
      context.setOverride(id, null);
    };
  }, [context, id, title]);
}
