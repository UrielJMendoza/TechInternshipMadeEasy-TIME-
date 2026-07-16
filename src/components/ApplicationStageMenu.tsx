"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  APPLICATION_STAGE_LABELS,
  APPLICATION_STAGES,
  type ApplicationStage,
} from "@/lib/applicationTracking";

const STAGE_CLASSES: Record<ApplicationStage, string> = {
  not_applied: "border-border bg-raised text-muted",
  applied: "border-accent/35 bg-accent/12 text-[#72b8ff]",
  oa: "border-[#bf5af2]/35 bg-[#bf5af2]/12 text-[#d99bff]",
  interview: "border-hot/35 bg-hot-soft text-[#ffb340]",
  rejected: "border-[#ff453a]/35 bg-[#ff453a]/12 text-[#ff8c85]",
  offer: "border-new/35 bg-new-soft text-[#5ddd7f]",
};

const SHORT_LABELS: Record<ApplicationStage, string> = {
  not_applied: "Track",
  applied: "Applied",
  oa: "OA",
  interview: "Interview",
  rejected: "Rejected",
  offer: "Offer",
};

interface MenuPosition {
  left: number;
  top: number;
  maxHeight: number;
  maxWidth: number;
  placement: "above" | "below";
}

export type MenuFocusCommand = "first" | "last" | "next" | "previous";

export interface MenuRectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface MenuSize {
  width: number;
  height: number;
}

export interface ViewportBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const VIEWPORT_PADDING = 8;
const MENU_GAP = 7;
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function menuOptionIndexForStage(stage: ApplicationStage): number {
  const index = APPLICATION_STAGES.indexOf(stage);
  return index < 0 ? 0 : index;
}

export function calculateMenuFocusIndex(
  currentIndex: number,
  selectedIndex: number,
  command: MenuFocusCommand,
  optionCount = APPLICATION_STAGES.length,
): number {
  if (optionCount <= 0) return -1;
  if (command === "first") return 0;
  if (command === "last") return optionCount - 1;

  const start =
    currentIndex >= 0 && currentIndex < optionCount
      ? currentIndex
      : clamp(selectedIndex, 0, optionCount - 1);
  const direction = command === "next" ? 1 : -1;
  return (start + direction + optionCount) % optionCount;
}

/** Pure placement logic shared by the live menu and viewport regression tests. */
export function calculateMenuPosition(
  trigger: MenuRectLike,
  menu: MenuSize,
  viewport: ViewportBounds,
  toolbarBottom: number | null = null,
): MenuPosition {
  const viewportTop = viewport.top + VIEWPORT_PADDING;
  const viewportBottom = viewport.bottom - VIEWPORT_PADDING;
  const topBoundary = Math.min(
    viewportBottom,
    Math.max(
      viewportTop,
      toolbarBottom === null ? viewportTop : toolbarBottom + MENU_GAP,
    ),
  );
  const desiredHeight = Math.min(
    menu.height,
    Math.max(1, viewportBottom - topBoundary),
  );

  const belowStart = Math.max(trigger.bottom + MENU_GAP, topBoundary);
  const aboveEnd = Math.min(trigger.top - MENU_GAP, viewportBottom);
  const belowSpace = Math.max(0, viewportBottom - belowStart);
  const aboveSpace = Math.max(0, aboveEnd - topBoundary);
  const placement =
    desiredHeight <= belowSpace ||
    (desiredHeight > aboveSpace && belowSpace >= aboveSpace)
      ? "below"
      : "above";
  const availableHeight = placement === "below" ? belowSpace : aboveSpace;
  const maxHeight = Math.max(1, Math.min(desiredHeight, availableHeight || 1));
  const preferredTop =
    placement === "below" ? belowStart : aboveEnd - maxHeight;
  const top = clamp(
    preferredTop,
    topBoundary,
    Math.max(topBoundary, viewportBottom - maxHeight),
  );

  const maxWidth = Math.max(
    1,
    viewport.right - viewport.left - VIEWPORT_PADDING * 2,
  );
  const renderedWidth = Math.min(menu.width, maxWidth);
  const minimumLeft = viewport.left + VIEWPORT_PADDING;
  const maximumLeft = Math.max(
    minimumLeft,
    viewport.right - VIEWPORT_PADDING - renderedWidth,
  );
  const left = clamp(
    trigger.right - renderedWidth,
    minimumLeft,
    maximumLeft,
  );

  return { left, top, maxHeight, maxWidth, placement };
}

function currentViewport(): ViewportBounds {
  const visualViewport = window.visualViewport;
  const left = visualViewport?.offsetLeft ?? 0;
  const top = visualViewport?.offsetTop ?? 0;
  const width = visualViewport?.width ?? window.innerWidth;
  const height = visualViewport?.height ?? window.innerHeight;
  return {
    left,
    right: left + width,
    top,
    bottom: top + height,
  };
}

function focusableOutsideMenu(menu: HTMLElement | null): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0 &&
      !menu?.contains(element),
  );
}

export function StageDot({ stage }: { stage: ApplicationStage }) {
  return (
    <span
      aria-hidden
      className={`size-2 shrink-0 rounded-full ${
        stage === "not_applied"
          ? "bg-faint"
          : stage === "applied"
            ? "bg-accent"
            : stage === "oa"
              ? "bg-[#bf5af2]"
              : stage === "interview"
                ? "bg-hot"
                : stage === "rejected"
                  ? "bg-[#ff453a]"
                  : "bg-new"
      }`}
    />
  );
}

export function ApplicationStageBadge({
  stage,
  compact = false,
}: {
  stage: ApplicationStage;
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold whitespace-nowrap ${STAGE_CLASSES[stage]}`}
    >
      <StageDot stage={stage} />
      {compact ? SHORT_LABELS[stage] : APPLICATION_STAGE_LABELS[stage]}
    </span>
  );
}

export function ApplicationStageMenu({
  stage,
  onChange,
  jobLabel,
}: {
  stage: ApplicationStage;
  onChange: (stage: ApplicationStage) => void;
  jobLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [activeIndex, setActiveIndex] = useState(() =>
    menuOptionIndexForStage(stage),
  );
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const shouldFocusSelectedRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open, stage]);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;

      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const viewport = currentViewport();
      const toolbar = document.querySelector<HTMLElement>(
        "[data-sticky-toolbar]",
      );
      const toolbarRect = toolbar?.getBoundingClientRect();
      const toolbarBottom =
        toolbarRect &&
        toolbarRect.bottom > viewport.top &&
        toolbarRect.top < viewport.bottom &&
        toolbarRect.top <= triggerRect.top
          ? toolbarRect.bottom
          : null;
      const next = calculateMenuPosition(
        triggerRect,
        { width: menuRect.width, height: menu.scrollHeight },
        viewport,
        toolbarBottom,
      );

      setPosition((current) =>
        current &&
        current.left === next.left &&
        current.top === next.top &&
        current.maxHeight === next.maxHeight &&
        current.maxWidth === next.maxWidth &&
        current.placement === next.placement
          ? current
          : next,
      );
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updatePosition);
      if (triggerRef.current) resizeObserver.observe(triggerRef.current);
      if (menuRef.current) resizeObserver.observe(menuRef.current);
      const toolbar = document.querySelector<HTMLElement>(
        "[data-sticky-toolbar]",
      );
      if (toolbar) resizeObserver.observe(toolbar);
    }

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [open]);

  const stopCardNavigation = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const stopPointerPropagation = (event: React.PointerEvent) => {
    event.stopPropagation();
  };

  const select = (nextStage: ApplicationStage) => {
    onChange(nextStage);
    setOpen(false);
    window.requestAnimationFrame(() =>
      triggerRef.current?.focus({ preventScroll: true }),
    );
  };

  const closeAndMovePastTrigger = (backwards: boolean) => {
    const trigger = triggerRef.current;
    if (!trigger) {
      setOpen(false);
      return;
    }
    const focusable = focusableOutsideMenu(menuRef.current);
    const triggerIndex = focusable.indexOf(trigger);
    const target =
      triggerIndex < 0
        ? null
        : focusable[triggerIndex + (backwards ? -1 : 1)] ?? null;
    setOpen(false);
    window.requestAnimationFrame(() => {
      if (target?.isConnected) target.focus({ preventScroll: true });
      else if (trigger.isConnected) trigger.focus({ preventScroll: true });
    });
  };

  const focusOption = (index: number) => {
    if (index < 0) return;
    setActiveIndex(index);
    optionRefs.current[index]?.focus({ preventScroll: true });
  };

  const openMenu = () => {
    const selectedIndex = menuOptionIndexForStage(stage);
    setPosition(null);
    setActiveIndex(selectedIndex);
    shouldFocusSelectedRef.current = true;
    setOpen(true);
  };

  const moveFocus = (
    event: React.KeyboardEvent,
    command: MenuFocusCommand,
  ) => {
    event.preventDefault();
    const currentIndex = optionRefs.current.findIndex(
      (option) => option === document.activeElement,
    );
    focusOption(
      calculateMenuFocusIndex(
        currentIndex,
        menuOptionIndexForStage(stage),
        command,
      ),
    );
  };

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto relative"
      onClick={stopCardNavigation}
      onPointerDown={stopPointerPropagation}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${APPLICATION_STAGE_LABELS[stage]} application stage for ${jobLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onKeyDown={(event) => {
          if (
            open ||
            !["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)
          ) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          openMenu();
        }}
        onClick={(event) => {
          stopCardNavigation(event);
          if (open) {
            setOpen(false);
            return;
          }
          openMenu();
        }}
        className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap transition-[border-color,background-color,color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent xl:min-h-9 xl:min-w-0 ${STAGE_CLASSES[stage]}`}
      >
        <StageDot stage={stage} />
        <span>{SHORT_LABELS[stage]}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-orientation="vertical"
            aria-label={`Application stage for ${jobLabel}`}
            onClick={stopCardNavigation}
            onPointerDown={stopPointerPropagation}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") moveFocus(event, "next");
              else if (event.key === "ArrowUp") moveFocus(event, "previous");
              else if (event.key === "Tab") {
                event.preventDefault();
                closeAndMovePastTrigger(event.shiftKey);
              } else if (event.key === "Home") {
                moveFocus(event, "first");
              } else if (event.key === "End") {
                moveFocus(event, "last");
              }
            }}
            className="fixed isolate z-[100] max-h-[calc(100dvh-1rem)] w-52 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-2xl border border-border-strong bg-raised p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.82)] ring-1 ring-black/60"
            style={{
              left: position?.left ?? -9999,
              top: position?.top ?? -9999,
              maxHeight: position?.maxHeight,
              maxWidth: position?.maxWidth,
              opacity: position ? 1 : 0,
              pointerEvents: position ? "auto" : "none",
            }}
          >
            <p className="px-2.5 py-2 text-xs font-bold uppercase tracking-[0.12em] text-faint">
              Application stage
            </p>
            {APPLICATION_STAGES.map((option, index) => (
              <button
                key={option}
                ref={(node) => {
                  optionRefs.current[index] = node;
                  if (
                    node &&
                    shouldFocusSelectedRef.current &&
                    index === menuOptionIndexForStage(stage)
                  ) {
                    node.focus({ preventScroll: true });
                    if (document.activeElement === node) {
                      shouldFocusSelectedRef.current = false;
                    }
                  }
                }}
                type="button"
                role="menuitemradio"
                aria-checked={stage === option}
                tabIndex={activeIndex === index ? 0 : -1}
                onFocus={() => setActiveIndex(index)}
                onClick={(event) => {
                  stopCardNavigation(event);
                  select(option);
                }}
                className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-2.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent xl:min-h-10 ${
                  stage === option
                    ? "bg-white/[0.08] text-fg"
                    : "text-muted hover:bg-white/[0.05] hover:text-fg"
                }`}
              >
                <span className="flex items-center gap-2">
                  <StageDot stage={option} />
                  {APPLICATION_STAGE_LABELS[option]}
                </span>
                {stage === option && <CheckIcon />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
