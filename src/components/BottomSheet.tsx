"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import { createPortal } from "react-dom";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  presentation?: "bottom-sheet" | "detail-drawer";
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.tabIndex >= 0 &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0,
  );
}

function focusInitialElement(container: HTMLElement): void {
  const preferred = container.querySelector<HTMLElement>(
    "[data-autofocus], [autofocus]",
  );
  const focusable = focusableElements(container);
  const target =
    (preferred && focusable.includes(preferred) ? preferred : null) ??
    focusable[0] ??
    container;
  target.focus({ preventScroll: true });
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  presentation = "bottom-sheet",
}: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusFrame = window.requestAnimationFrame(() => {
      if (panelRef.current) focusInitialElement(panelRef.current);
    });

    const keepFocusInside = (event: FocusEvent) => {
      const panel = panelRef.current;
      const target =
        event.target instanceof Element ? event.target : null;
      const isOwnedPortal = Boolean(
        target?.closest("[data-dialog-portal='true']"),
      );
      if (
        panel &&
        event.target instanceof Node &&
        !panel.contains(event.target) &&
        !isOwnedPortal
      ) {
        focusInitialElement(panel);
      }
    };

    document.addEventListener("focusin", keepFocusInside);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("focusin", keepFocusInside);
      const previouslyFocused = previouslyFocusedRef.current;
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
      previouslyFocusedRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (
        event.target instanceof Element &&
        event.target.closest("[data-dialog-portal='true']")
      ) {
        return;
      }
      event.preventDefault();
      onClose();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  const trapTabKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;

    const panel = panelRef.current;
    if (!panel) return;

    const focusable = focusableElements(panel);
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey) {
      if (activeElement === first || !panel.contains(activeElement)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      }
    } else if (activeElement === last || !panel.contains(activeElement)) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`ui-dialog-overlay motion-overlay fixed inset-0 z-[var(--layer-dialog)] flex items-end justify-center ${
        presentation === "detail-drawer"
          ? "sm:items-stretch sm:justify-end"
          : ""
      }`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTabKey}
        className={`ui-dialog flex w-full flex-col overflow-hidden rounded-b-none border-b-0 focus:outline-none ${
          presentation === "detail-drawer"
            ? "motion-detail-drawer max-h-[92dvh] max-w-2xl sm:h-dvh sm:max-h-dvh sm:max-w-[38rem] sm:rounded-none sm:border-y-0 sm:border-r-0"
            : "motion-drawer max-h-[85dvh] max-w-2xl"
        }`}
      >
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-4 sm:px-6">
          <h2 id={titleId} className="text-base font-semibold text-fg">
            {title}
          </h2>
          <button
            type="button"
            aria-label={`Close ${title}`}
            onClick={onClose}
            className="ui-button ui-button--quiet ui-button--icon size-11 min-h-11 shrink-0 p-0"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          {children}
        </div>

        {footer !== undefined && (
          <div className="shrink-0 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [&_a]:min-h-11 [&_button]:min-h-11 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
