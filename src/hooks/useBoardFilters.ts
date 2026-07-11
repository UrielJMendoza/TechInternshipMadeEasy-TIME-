"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BOARD_FILTER_STORAGE_KEY,
  DEFAULT_BOARD_FILTERS,
  boardUrl,
  parseBoardFilters,
  type BoardFilters,
} from "@/lib/boardFilterState";

type HistoryMode = "push" | "replace";
type FilterUpdate =
  | Partial<BoardFilters>
  | ((current: BoardFilters) => BoardFilters);

export function useBoardFilters() {
  const [filters, setFilters] = useState<BoardFilters>(DEFAULT_BOARD_FILTERS);
  const [ready, setReady] = useState(false);
  const historyModeRef = useRef<HistoryMode>("replace");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(BOARD_FILTER_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }

    // This is an intentional post-SSR hydration from browser-owned state.
    /* eslint-disable react-hooks/set-state-in-effect */
    setFilters(parseBoardFilters(window.location.search, stored));
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */

    const onPopState = () => {
      historyModeRef.current = "replace";
      setFilters(parseBoardFilters(window.location.search));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!ready) return;

    try {
      localStorage.setItem(BOARD_FILTER_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // Keep the current in-memory state if persistence is unavailable.
    }

    const nextUrl = boardUrl(
      window.location.pathname,
      window.location.search,
      filters,
    );
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      const method = historyModeRef.current === "push" ? "pushState" : "replaceState";
      window.history[method](null, "", nextUrl);
    }
    historyModeRef.current = "replace";
  }, [filters, ready]);

  const updateFilters = useCallback(
    (update: FilterUpdate, historyMode: HistoryMode = "push") => {
      historyModeRef.current = historyMode;
      setFilters((current) =>
        typeof update === "function" ? update(current) : { ...current, ...update },
      );
    },
    [],
  );

  const clearFilters = useCallback(() => {
    historyModeRef.current = "push";
    setFilters((current) => ({
      ...DEFAULT_BOARD_FILTERS,
      tab: current.tab,
    }));
  }, []);

  return { filters, ready, updateFilters, clearFilters };
}
