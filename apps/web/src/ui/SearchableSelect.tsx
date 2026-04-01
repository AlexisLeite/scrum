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
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const listboxId = React.useId();

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

  React.useEffect(() => {
    if (!open) {
      setQuery("");
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

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
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
            placeholder={searchPlaceholder}
            aria-label={ariaLabel ? `Buscar en ${ariaLabel}` : searchPlaceholder}
            autoComplete="off"
          />
          <div id={listboxId} className="searchable-select-options" role="listbox">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={`${option.value}-${option.label}`}
                  type="button"
                  className={`searchable-select-option${option.value === value ? " is-selected" : ""}`}
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
