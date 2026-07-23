"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  APPLICATION_STAGE_LABELS,
  TRACKED_APPLICATION_STAGES,
  type ApplicationStage,
} from "@/lib/applicationTracking";

const STAGE_CLASSES: Record<ApplicationStage, string> = {
  not_applied: "border-border-strong bg-raised text-muted",
  saved: "border-border-strong bg-raised text-muted",
  preparing: "border-warning/35 bg-warning-soft text-warning",
  applied: "border-accent/35 bg-accent-soft text-accent-hover",
  assessment: "border-info/35 bg-info-soft text-info",
  interview: "border-accent/35 bg-accent-soft text-accent-hover",
  offer: "border-success/35 bg-success-soft text-success",
  rejected: "border-error/35 bg-error-soft text-error",
  withdrawn: "border-border-strong bg-raised text-muted",
  archived: "border-border bg-raised text-faint",
};

const SHORT_LABELS: Record<ApplicationStage, string> = {
  not_applied: "Track",
  saved: "Saved",
  preparing: "Preparing",
  applied: "Applied",
  assessment: "Assessment",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  archived: "Archived",
};

const STAGE_DOT_CLASSES: Record<ApplicationStage, string> = {
  not_applied: "bg-faint",
  saved: "bg-faint",
  preparing: "bg-warning",
  applied: "bg-accent",
  assessment: "bg-info",
  interview: "bg-accent-hover",
  offer: "bg-success",
  rejected: "bg-error",
  withdrawn: "bg-muted",
  archived: "bg-faint",
};

const STAGE_MENU_OPTIONS = TRACKED_APPLICATION_STAGES;

interface MenuPosition {
  left: number;
  top: number;
}

const VIEWPORT_PADDING = 8;
const MENU_GAP = 7;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function StageDot({ stage }: { stage: ApplicationStage }) {
  return (
    <span
      aria-hidden
      data-stage={stage}
      className={`motion-stage-dot size-2 shrink-0 rounded-full ${STAGE_DOT_CLASSES[stage]}`}
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
      data-stage={stage}
      className={`ui-badge motion-stage-transition ${STAGE_CLASSES[stage]}`}
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
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = STAGE_MENU_OPTIONS.indexOf(
      stage as (typeof STAGE_MENU_OPTIONS)[number],
    );
    optionRefs.current[Math.max(0, selectedIndex)]?.focus();

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
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
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
      const maximumLeft =
        window.innerWidth - menuRect.width - VIEWPORT_PADDING;
      const left = clamp(
        triggerRect.right - menuRect.width,
        VIEWPORT_PADDING,
        maximumLeft,
      );

      const topBelow = triggerRect.bottom + MENU_GAP;
      const topAbove = triggerRect.top - menuRect.height - MENU_GAP;
      const fitsBelow =
        topBelow + menuRect.height <=
        window.innerHeight - VIEWPORT_PADDING;
      const preferredTop = fitsBelow ? topBelow : topAbove;
      const top = clamp(
        preferredTop,
        VIEWPORT_PADDING,
        window.innerHeight - menuRect.height - VIEWPORT_PADDING,
      );

      setPosition({ left, top });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updatePosition);
      if (triggerRef.current) resizeObserver.observe(triggerRef.current);
      if (menuRef.current) resizeObserver.observe(menuRef.current);
    }

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
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
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const moveFocus = (event: React.KeyboardEvent, direction: 1 | -1) => {
    event.preventDefault();
    const currentIndex = optionRefs.current.findIndex(
      (option) => option === document.activeElement,
    );
    const selectedIndex = STAGE_MENU_OPTIONS.indexOf(
      stage as (typeof STAGE_MENU_OPTIONS)[number],
    );
    const start = currentIndex < 0 ? Math.max(0, selectedIndex) : currentIndex;
    const next =
      (start + direction + STAGE_MENU_OPTIONS.length) %
      STAGE_MENU_OPTIONS.length;
    optionRefs.current[next]?.focus();
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
        data-stage={stage}
        type="button"
        aria-label={`${APPLICATION_STAGE_LABELS[stage]} application stage for ${jobLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          stopCardNavigation(event);
          if (!open) setPosition(null);
          setOpen((current) => !current);
        }}
        className={`ui-button ui-button--sm motion-stage-transition min-h-11 px-2 text-[11px] sm:min-h-9 sm:px-2.5 ${STAGE_CLASSES[stage]}`}
      >
        <StageDot stage={stage} />
        <span className="sr-only sm:not-sr-only">{SHORT_LABELS[stage]}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            data-dialog-portal="true"
            role="menu"
            aria-label={`Application stage for ${jobLabel}`}
            onClick={stopCardNavigation}
            onPointerDown={stopPointerPropagation}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") moveFocus(event, 1);
              else if (event.key === "ArrowUp") moveFocus(event, -1);
              else if (event.key === "Tab") {
                event.preventDefault();
                setOpen(false);
                window.requestAnimationFrame(() =>
                  triggerRef.current?.focus(),
                );
              }
              else if (event.key === "Home") {
                event.preventDefault();
                optionRefs.current[0]?.focus();
              } else if (event.key === "End") {
                event.preventDefault();
                optionRefs.current[STAGE_MENU_OPTIONS.length - 1]?.focus();
              }
            }}
            className="ui-popover motion-filter-panel fixed isolate z-[var(--layer-tooltip)] max-h-[min(28rem,calc(100dvh-1rem))] w-56 overflow-y-auto p-1.5"
            style={{
              left: position?.left ?? -9999,
              top: position?.top ?? -9999,
              visibility: position ? "visible" : "hidden",
            }}
          >
            <p className="px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
              Application stage
            </p>
            {STAGE_MENU_OPTIONS.map((option, index) => (
              <button
                key={option}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={stage === option}
                tabIndex={
                  stage === option ||
                  (stage === "not_applied" && index === 0)
                    ? 0
                    : -1
                }
                onClick={(event) => {
                  stopCardNavigation(event);
                  select(option);
                }}
                className={`motion-stage-transition flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left text-sm ${
                  stage === option
                    ? "bg-accent-soft text-accent-hover"
                    : "text-muted hover:bg-raised hover:text-fg"
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
