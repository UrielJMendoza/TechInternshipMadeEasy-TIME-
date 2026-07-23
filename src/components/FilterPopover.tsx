"use client";

import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

export function FilterPopover({
  label,
  activeCount = 0,
  disabled = false,
  title,
  children,
  className = "",
}: {
  label: string;
  activeCount?: number;
  disabled?: boolean;
  title?: string;
  children: (close: () => void) => ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const first = root?.querySelector<HTMLElement>(
      '[role="dialog"] input:not([disabled]), [role="dialog"] button:not([disabled]), [role="dialog"] select:not([disabled])',
    );
    first?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        title={title}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((current) => !current)}
        className={`ui-button ui-button--sm min-h-10 font-semibold ${
          activeCount > 0
            ? "ui-selected"
            : "ui-button--secondary"
        }`}
      >
        <span>{label}</span>
        {activeCount > 0 && (
          <span
            key={activeCount}
            className="motion-value-update inline-flex size-5 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-on-accent"
          >
            {activeCount}
          </span>
        )}
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className="ui-popover motion-filter-panel absolute right-0 top-[calc(100%+0.5rem)] z-[var(--layer-popover)] min-w-64 max-w-[calc(100vw-2rem)] p-2"
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
