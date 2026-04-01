import React from "react";
import "./searchable-select.css";

export type SearchableSelectOption = {
  value: string;
  label: string;
  searchText?: string;
  disabled?: boolean;
};

type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
};

export function buildSearchableSelectOptions(values: string[]) {
  return values.map((value) => ({ value, label: value }));
}

function normalizeValue(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function SearchableSelect(props: SearchableSelectProps) {
  const {
    value,
    onChange,
    options,
    placeholder = "Seleccionar opcion",
    searchPlaceholder = "Buscar opcion...",
    emptyMessage = "No hay resultados para esta busqueda.",
    disabled = false,
    ariaLabel,
    className = ""
  } = props;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const listboxId = React.useId();
  const optionIdPrefix = React.useId();

  const selectedOption = React.useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );

  const filteredOptions = React.useMemo(() => {
    const normalizedQuery = normalizeValue(query);
    if (!normalizedQuery) {
      return options;
    }
    return options.filter((option) => {
      const haystack = normalizeValue(`${option.label} ${option.searchText ?? option.value}`);
      return haystack.includes(normalizedQuery);
    });
  }, [options, query]);

  const firstEnabledIndex = React.useMemo(
    () => filteredOptions.findIndex((option) => !option.disabled),
    [filteredOptions]
  );

  const selectedEnabledIndex = React.useMemo(
    () => filteredOptions.findIndex((option) => option.value === value && !option.disabled),
    [filteredOptions, value]
  );

  const moveActiveIndex = React.useCallback((direction: 1 | -1) => {
    if (filteredOptions.length === 0) {
      return;
    }

    setActiveIndex((current) => {
      const fallbackIndex = direction === 1
        ? (selectedEnabledIndex >= 0 ? selectedEnabledIndex : firstEnabledIndex)
        : (() => {
            if (selectedEnabledIndex >= 0) return selectedEnabledIndex;
            for (let index = filteredOptions.length - 1; index >= 0; index -= 1) {
              if (!filteredOptions[index]?.disabled) return index;
            }
            return -1;
          })();

      let nextIndex = current >= 0 ? current : fallbackIndex;
      if (nextIndex < 0) {
        return current;
      }

      for (let attempt = 0; attempt < filteredOptions.length; attempt += 1) {
        nextIndex = (nextIndex + direction + filteredOptions.length) % filteredOptions.length;
        if (!filteredOptions[nextIndex]?.disabled) {
          return nextIndex;
        }
      }

      return current;
    });
  }, [filteredOptions, firstEnabledIndex, selectedEnabledIndex]);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(-1);
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    setActiveIndex((current) => {
      if (current >= 0 && current < filteredOptions.length && !filteredOptions[current]?.disabled) {
        return current;
      }
      if (selectedEnabledIndex >= 0) {
        return selectedEnabledIndex;
      }
      return firstEnabledIndex;
    });
  }, [filteredOptions, firstEnabledIndex, open, selectedEnabledIndex]);

  React.useEffect(() => {
    if (!open || activeIndex < 0) {
      return;
    }

    optionRefs.current[activeIndex]?.scrollIntoView({
      block: "nearest"
    });
  }, [activeIndex, open]);

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      if (!open) {
        setActiveIndex(selectedEnabledIndex >= 0 ? selectedEnabledIndex : firstEnabledIndex);
      } else {
        moveActiveIndex(1);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (!open) {
        const lastEnabledIndex = [...filteredOptions]
          .map((option, index) => ({ option, index }))
          .reverse()
          .find((entry) => !entry.option.disabled)?.index ?? -1;
        setActiveIndex(selectedEnabledIndex >= 0 ? selectedEnabledIndex : lastEnabledIndex);
      } else {
        moveActiveIndex(-1);
      }
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => !current);
    }
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActiveIndex(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActiveIndex(-1);
      return;
    }

    if (event.key === "Enter") {
      const activeOption = filteredOptions[activeIndex];
      if (!activeOption || activeOption.disabled) {
        return;
      }
      event.preventDefault();
      handleSelect(activeOption.value);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`searchable-select${open ? " is-open" : ""}${disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`}
    >
      <button
        type="button"
        className="searchable-select-trigger"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
      >
        <span className={`searchable-select-trigger-label${selectedOption ? "" : " is-placeholder"}`}>
          {selectedOption?.label ?? placeholder}
        </span>
        <span className="searchable-select-trigger-icon" aria-hidden="true">
          v
        </span>
      </button>
      {open ? (
        <div className="searchable-select-popover">
          <input
            ref={searchInputRef}
            className="searchable-select-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={searchPlaceholder}
            aria-label={ariaLabel ? `Buscar en ${ariaLabel}` : searchPlaceholder}
            aria-controls={listboxId}
            aria-activedescendant={activeIndex >= 0 ? `${optionIdPrefix}-${activeIndex}` : undefined}
            autoComplete="off"
          />
          <div id={listboxId} className="searchable-select-options" role="listbox">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => (
                <button
                  key={`${option.value}-${option.label}`}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  id={`${optionIdPrefix}-${index}`}
                  type="button"
                  className={`searchable-select-option${option.value === value ? " is-selected" : ""}${activeIndex === index ? " is-active" : ""}`}
                  onClick={() => handleSelect(option.value)}
                  disabled={option.disabled}
                  role="option"
                  aria-selected={option.value === value}
                >
                  <span>{option.label}</span>
                </button>
              ))
            ) : (
              <div className="searchable-select-empty">{emptyMessage}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
