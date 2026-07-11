"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

interface TruncatedTooltipProps {
  text: string;
  className?: string;
}

interface TooltipPosition {
  left: number;
  top: number;
}

const VIEWPORT_PADDING = 8;
const TOOLTIP_GAP = 8;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function TruncatedTooltip({
  text,
  className = "",
}: TruncatedTooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);
  const tooltipId = useId();
  const [isTruncated, setIsTruncated] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const measureOverflow = () => {
      const nextIsTruncated = trigger.scrollWidth > trigger.clientWidth;
      setIsTruncated(nextIsTruncated);
    };

    measureOverflow();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(measureOverflow);
      resizeObserver.observe(trigger);
    } else {
      window.addEventListener("resize", measureOverflow);
    }

    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) measureOverflow();
    });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureOverflow);
    };
  }, [className, text]);

  const showTooltip =
    isTruncated && !isDismissed && (isHovered || isFocused);

  useLayoutEffect(() => {
    if (!showTooltip) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;
      if (!trigger || !tooltip) return;

      const triggerRect = trigger.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const maximumLeft =
        window.innerWidth - tooltipRect.width - VIEWPORT_PADDING;
      const left = clamp(
        triggerRect.left + (triggerRect.width - tooltipRect.width) / 2,
        VIEWPORT_PADDING,
        maximumLeft,
      );

      const topAbove = triggerRect.top - tooltipRect.height - TOOLTIP_GAP;
      const topBelow = triggerRect.bottom + TOOLTIP_GAP;
      const fitsAbove = topAbove >= VIEWPORT_PADDING;
      const fitsBelow =
        topBelow + tooltipRect.height <=
        window.innerHeight - VIEWPORT_PADDING;
      const preferredTop = fitsAbove || !fitsBelow ? topAbove : topBelow;
      const top = clamp(
        preferredTop,
        VIEWPORT_PADDING,
        window.innerHeight - tooltipRect.height - VIEWPORT_PADDING,
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
      if (tooltipRef.current) resizeObserver.observe(tooltipRef.current);
    }

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showTooltip, text]);

  useEffect(() => {
    if (!showTooltip) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsDismissed(true);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showTooltip]);

  useEffect(
    () => () => {
      if (hoverCloseTimerRef.current !== null) {
        window.clearTimeout(hoverCloseTimerRef.current);
      }
    },
    [],
  );

  const beginHover = () => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
    setIsDismissed(false);
    setIsHovered(true);
  };

  const endHover = () => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
    }
    hoverCloseTimerRef.current = window.setTimeout(() => {
      setIsHovered(false);
      hoverCloseTimerRef.current = null;
    }, 100);
  };

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={isTruncated ? 0 : undefined}
        aria-describedby={showTooltip ? tooltipId : undefined}
        onMouseEnter={beginHover}
        onMouseLeave={endHover}
        onFocus={() => {
          setIsDismissed(false);
          setIsFocused(true);
        }}
        onBlur={() => setIsFocused(false)}
        className={`block min-w-0 truncate focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
      >
        {text}
      </span>

      {showTooltip &&
        createPortal(
          <span
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            onMouseEnter={beginHover}
            onMouseLeave={endHover}
            className="pointer-events-auto fixed z-[120] w-max max-w-[calc(100vw-1rem)] rounded-lg border border-border-strong bg-raised px-3 py-2 text-xs leading-snug text-fg shadow-[0_12px_32px_rgba(0,0,0,0.55)] [overflow-wrap:anywhere]"
            style={{
              left: position?.left ?? -9999,
              top: position?.top ?? -9999,
              visibility: position ? "visible" : "hidden",
            }}
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  );
}
