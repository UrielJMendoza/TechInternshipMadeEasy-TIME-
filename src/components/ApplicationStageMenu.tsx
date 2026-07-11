"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold whitespace-nowrap ${STAGE_CLASSES[stage]}`}
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
    const selectedIndex = APPLICATION_STAGES.indexOf(stage);
    optionRefs.current[selectedIndex]?.focus();

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
    const start = currentIndex < 0 ? APPLICATION_STAGES.indexOf(stage) : currentIndex;
    const next = (start + direction + APPLICATION_STAGES.length) % APPLICATION_STAGES.length;
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
        type="button"
        aria-label={`${APPLICATION_STAGE_LABELS[stage]} application stage for ${jobLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          stopCardNavigation(event);
          if (!open) setPosition(null);
          setOpen((current) => !current);
        }}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-2 text-[11px] font-semibold whitespace-nowrap transition-[border-color,background-color,color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-9 sm:px-2.5 ${STAGE_CLASSES[stage]}`}
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
            role="menu"
            aria-label={`Application stage for ${jobLabel}`}
            onClick={stopCardNavigation}
            onPointerDown={stopPointerPropagation}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") moveFocus(event, 1);
              else if (event.key === "ArrowUp") moveFocus(event, -1);
              else if (event.key === "Tab") setOpen(false);
              else if (event.key === "Home") {
                event.preventDefault();
                optionRefs.current[0]?.focus();
              } else if (event.key === "End") {
                event.preventDefault();
                optionRefs.current[APPLICATION_STAGES.length - 1]?.focus();
              }
            }}
            className="fixed isolate z-[45] w-52 rounded-2xl border border-border-strong bg-[#1f1f23] p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.82)] ring-1 ring-black/60"
            style={{
              left: position?.left ?? -9999,
              top: position?.top ?? -9999,
              visibility: position ? "visible" : "hidden",
            }}
          >
            <p className="px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
              Application stage
            </p>
            {APPLICATION_STAGES.map((option, index) => (
              <button
                key={option}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={stage === option}
                onClick={(event) => {
                  stopCardNavigation(event);
                  select(option);
                }}
                className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-2.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
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
