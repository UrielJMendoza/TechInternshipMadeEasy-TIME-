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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (
          nextTarget instanceof Node &&
          rootRef.current?.contains(nextTarget)
        ) {
          return;
        }
        window.requestAnimationFrame(() => {
          const root = rootRef.current;
          if (root && !root.contains(document.activeElement)) close();
        });
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        title={title}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 ${
          activeCount > 0
            ? "border-accent/45 bg-accent/10 text-accent"
            : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg"
        }`}
      >
        <span>{label}</span>
        {activeCount > 0 && (
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-action text-xs font-bold text-white">
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
          className="absolute left-0 top-[calc(100%+0.5rem)] z-[80] w-64 max-w-[calc(100vw-1rem)] rounded-2xl border border-border-strong bg-raised p-2 shadow-[0_18px_50px_rgba(0,0,0,0.72)]"
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
