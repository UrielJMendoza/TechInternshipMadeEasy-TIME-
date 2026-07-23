"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONTINUITY_LOCAL_CHANGE_EVENT,
  dispatchContinuityLocalChange,
  readContinuityLocalChange,
} from "@/components/ContinuityProvider";
import {
  BOARD_FILTER_STORAGE_KEY,
  DEFAULT_BOARD_FILTERS,
  boardUrl,
  hasBoardFilterParams,
  parseBoardFilters,
  parseStoredBoardFilters,
  type BoardFilters,
} from "@/lib/boardFilterState";
import { BOARD_FILTER_UPDATED_AT_STORAGE_KEY } from "@/lib/continuitySnapshot";

type HistoryMode = "push" | "replace";
type FilterUpdate =
  | Partial<BoardFilters>
  | ((current: BoardFilters) => BoardFilters);

export function useBoardFilters() {
  const [filters, setFilters] = useState<BoardFilters>(DEFAULT_BOARD_FILTERS);
  const [ready, setReady] = useState(false);
  const historyModeRef = useRef<HistoryMode>("replace");
  const userEditRef = useRef(false);

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
    const readSyncedFilters = () => {
      if (hasBoardFilterParams(window.location.search)) return;
      try {
        setFilters(
          parseStoredBoardFilters(
            localStorage.getItem(BOARD_FILTER_STORAGE_KEY),
          ),
        );
      } catch {
        // Keep the current in-memory filters.
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === BOARD_FILTER_STORAGE_KEY ||
        event.key === BOARD_FILTER_UPDATED_AT_STORAGE_KEY
      ) {
        readSyncedFilters();
      }
    };
    const onContinuityChange = (event: Event) => {
      const detail = readContinuityLocalChange(event);
      if (detail?.category === "filters" && detail.source === "sync") {
        readSyncedFilters();
      }
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("storage", onStorage);
    window.addEventListener(
      CONTINUITY_LOCAL_CHANGE_EVENT,
      onContinuityChange,
    );
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        CONTINUITY_LOCAL_CHANGE_EVENT,
        onContinuityChange,
      );
    };
  }, []);

  useEffect(() => {
    if (!ready) return;

    const userEdited = userEditRef.current;
    userEditRef.current = false;
    try {
      const serialized = JSON.stringify(filters);
      const stored = localStorage.getItem(BOARD_FILTER_STORAGE_KEY);
      const changed = stored !== serialized;
      const pristineDefaultHydration =
        !userEdited &&
        stored === null &&
        !hasBoardFilterParams(window.location.search) &&
        serialized === JSON.stringify(DEFAULT_BOARD_FILTERS);
      if (changed && !pristineDefaultHydration) {
        localStorage.setItem(BOARD_FILTER_STORAGE_KEY, serialized);
      }
      if (userEdited) {
        localStorage.setItem(
          BOARD_FILTER_UPDATED_AT_STORAGE_KEY,
          new Date().toISOString(),
        );
        dispatchContinuityLocalChange("filters");
      }
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
      userEditRef.current = true;
      setFilters((current) =>
        typeof update === "function" ? update(current) : { ...current, ...update },
      );
    },
    [],
  );

  const clearFilters = useCallback(() => {
    historyModeRef.current = "push";
    userEditRef.current = true;
    setFilters((current) => ({
      ...DEFAULT_BOARD_FILTERS,
      tab: current.tab,
    }));
  }, []);

  return { filters, ready, updateFilters, clearFilters };
}
