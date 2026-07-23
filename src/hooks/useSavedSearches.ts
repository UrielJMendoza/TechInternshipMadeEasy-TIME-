"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONTINUITY_LOCAL_CHANGE_EVENT,
  dispatchContinuityLocalChange,
  readContinuityLocalChange,
} from "@/components/ContinuityProvider";
import {
  MAX_SAVED_SEARCHES,
  SAVED_SEARCH_CHANGE_EVENT,
  SAVED_SEARCH_STORAGE_KEY,
  SAVED_SEARCH_TOMBSTONE_STORAGE_KEY,
  createSavedSearchRecord,
  mergeSavedSearchStates,
  parseSavedSearch,
  parseStoredSavedSearches,
  parseStoredSavedSearchTombstones,
  serializeSavedSearches,
  serializeSavedSearchTombstones,
  timestampAfter,
  type CreateSavedSearchInput,
  type SavedSearch,
  type SavedSearchChannels,
  type SavedSearchFrequency,
  type SavedSearchState,
  type SavedSearchTombstone,
} from "@/lib/savedSearches";
import type { BoardFilters } from "@/lib/boardFilterState";

export interface SavedSearchPatch {
  name?: string;
  filters?: BoardFilters;
  frequency?: SavedSearchFrequency;
  channels?: Partial<SavedSearchChannels>;
}

export type SavedSearchReplacement =
  | readonly SavedSearch[]
  | SavedSearchState;

interface SavedSearchChangeDetail {
  searches: string;
  tombstones: string;
}

const EMPTY_STATE: SavedSearchState = {
  searches: [],
  tombstones: [],
};

function serializedState(
  state: SavedSearchState,
): SavedSearchChangeDetail {
  return {
    searches: serializeSavedSearches(state.searches),
    tombstones: serializeSavedSearchTombstones(state.tombstones),
  };
}

function statesEqual(
  left: SavedSearchState,
  right: SavedSearchState,
): boolean {
  const leftSerialized = serializedState(left);
  const rightSerialized = serializedState(right);
  return (
    leftSerialized.searches === rightSerialized.searches &&
    leftSerialized.tombstones === rightSerialized.tombstones
  );
}

function readLocalState(): SavedSearchState {
  try {
    return mergeSavedSearchStates({
      searches: parseStoredSavedSearches(
        localStorage.getItem(SAVED_SEARCH_STORAGE_KEY),
      ),
      tombstones: parseStoredSavedSearchTombstones(
        localStorage.getItem(SAVED_SEARCH_TOMBSTONE_STORAGE_KEY),
      ),
    });
  } catch {
    return EMPTY_STATE;
  }
}

function writeLocalState(
  state: SavedSearchState,
  announce: boolean,
): void {
  const serialized = serializedState(state);

  // Write the deletion markers first. If another tab observes the two writes
  // separately, it sees the tombstone before it can see a stale live record.
  try {
    localStorage.setItem(
      SAVED_SEARCH_TOMBSTONE_STORAGE_KEY,
      serialized.tombstones,
    );
    localStorage.setItem(SAVED_SEARCH_STORAGE_KEY, serialized.searches);
  } catch {
    // Anonymous/local use should keep working in restricted storage contexts.
  }

  if (announce) {
    window.dispatchEvent(
      new CustomEvent<SavedSearchChangeDetail>(SAVED_SEARCH_CHANGE_EVENT, {
        detail: serialized,
      }),
    );
    dispatchContinuityLocalChange("savedSearches");
  }
}

function stateFromChangeEvent(event: Event): SavedSearchState | null {
  const detail = (event as CustomEvent<unknown>).detail;
  if (
    typeof detail !== "object" ||
    detail === null ||
    !("searches" in detail) ||
    !("tombstones" in detail)
  ) {
    return null;
  }
  const candidate = detail as Partial<SavedSearchChangeDetail>;
  if (
    typeof candidate.searches !== "string" ||
    typeof candidate.tombstones !== "string"
  ) {
    return null;
  }
  return mergeSavedSearchStates({
    searches: parseStoredSavedSearches(candidate.searches),
    tombstones: parseStoredSavedSearchTombstones(candidate.tombstones),
  });
}

function isSavedSearchState(
  replacement: SavedSearchReplacement,
): replacement is SavedSearchState {
  return !Array.isArray(replacement);
}

export function useSavedSearches() {
  const [state, setState] = useState<SavedSearchState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);
  const stateRef = useRef<SavedSearchState>(EMPTY_STATE);

  const applyState = useCallback(
    (candidate: SavedSearchState, announce = true): SavedSearchState => {
      const next = mergeSavedSearchStates(candidate);
      if (statesEqual(stateRef.current, next)) return stateRef.current;
      stateRef.current = next;
      setState(next);
      writeLocalState(next, announce);
      return next;
    },
    [],
  );

  useEffect(() => {
    const initial = readLocalState();
    stateRef.current = initial;
    // Intentional hydration from browser-owned anonymous state.
    /* eslint-disable react-hooks/set-state-in-effect */
    setState(initial);
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */

    const canonical = serializedState(initial);
    try {
      if (
        localStorage.getItem(SAVED_SEARCH_STORAGE_KEY) !==
          canonical.searches ||
        localStorage.getItem(SAVED_SEARCH_TOMBSTONE_STORAGE_KEY) !==
          canonical.tombstones
      ) {
        writeLocalState(initial, false);
      }
    } catch {
      // The in-memory state remains usable.
    }

    const reconcile = (incoming: SavedSearchState) => {
      const merged = mergeSavedSearchStates(stateRef.current, incoming);
      if (!statesEqual(stateRef.current, merged)) {
        stateRef.current = merged;
        setState(merged);
      }

      // A storage event can represent one half of a near-simultaneous write.
      // Re-persisting the merged winner converges tabs without another custom
      // event loop; native storage events notify the other documents.
      const serialized = serializedState(merged);
      try {
        if (
          localStorage.getItem(SAVED_SEARCH_STORAGE_KEY) !==
            serialized.searches ||
          localStorage.getItem(SAVED_SEARCH_TOMBSTONE_STORAGE_KEY) !==
            serialized.tombstones
        ) {
          writeLocalState(merged, false);
        }
      } catch {
        // Same-tab event details still synchronize in-memory consumers.
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === null) {
        stateRef.current = EMPTY_STATE;
        setState(EMPTY_STATE);
        return;
      }
      if (
        event.key !== SAVED_SEARCH_STORAGE_KEY &&
        event.key !== SAVED_SEARCH_TOMBSTONE_STORAGE_KEY
      ) {
        return;
      }
      reconcile(readLocalState());
    };

    const onSameTabChange = (event: Event) => {
      reconcile(stateFromChangeEvent(event) ?? readLocalState());
    };
    const onContinuityChange = (event: Event) => {
      const detail = readContinuityLocalChange(event);
      if (detail?.category === "savedSearches" && detail.source === "sync") {
        reconcile(readLocalState());
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(SAVED_SEARCH_CHANGE_EVENT, onSameTabChange);
    window.addEventListener(
      CONTINUITY_LOCAL_CHANGE_EVENT,
      onContinuityChange,
    );
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SAVED_SEARCH_CHANGE_EVENT, onSameTabChange);
      window.removeEventListener(
        CONTINUITY_LOCAL_CHANGE_EVENT,
        onContinuityChange,
      );
    };
  }, []);

  const createSearch = useCallback(
    (input: CreateSavedSearchInput): SavedSearch | null => {
      if (stateRef.current.searches.length >= MAX_SAVED_SEARCHES) return null;

      const existingIds = new Set([
        ...stateRef.current.searches.map((search) => search.id),
        ...stateRef.current.tombstones.map((tombstone) => tombstone.id),
      ]);
      let created: SavedSearch | null = null;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = createSavedSearchRecord(input);
        if (candidate && !existingIds.has(candidate.id)) {
          created = candidate;
          break;
        }
      }
      if (!created) return null;

      const next = mergeSavedSearchStates(stateRef.current, {
        searches: [created],
        tombstones: [],
      });
      applyState(next);
      return next.searches.some((search) => search.id === created.id)
        ? created
        : null;
    },
    [applyState],
  );

  const editSearch = useCallback(
    (id: string, patch: SavedSearchPatch): SavedSearch | null => {
      const existing = stateRef.current.searches.find(
        (search) => search.id === id,
      );
      if (!existing) return null;

      const updated = parseSavedSearch({
        ...existing,
        name: patch.name ?? existing.name,
        filters: patch.filters ?? existing.filters,
        frequency: patch.frequency ?? existing.frequency,
        channels: patch.channels
          ? { ...existing.channels, ...patch.channels }
          : existing.channels,
        updatedAt: timestampAfter(existing.updatedAt),
      });
      if (!updated) return null;

      const next = mergeSavedSearchStates(stateRef.current, {
        searches: [updated],
        tombstones: [],
      });
      applyState(next);
      return next.searches.find((search) => search.id === id) ?? null;
    },
    [applyState],
  );

  const pauseSearch = useCallback(
    (id: string): SavedSearch | null =>
      editSearch(id, { frequency: "paused" }),
    [editSearch],
  );

  const deleteSearch = useCallback(
    (id: string): boolean => {
      const existing = stateRef.current.searches.find(
        (search) => search.id === id,
      );
      if (!existing) return false;
      const previousTombstone = stateRef.current.tombstones.find(
        (tombstone) => tombstone.id === id,
      );
      const tombstone: SavedSearchTombstone = {
        id,
        deletedAt: timestampAfter(
          existing.updatedAt,
          previousTombstone?.deletedAt ?? "",
        ),
      };
      const next = mergeSavedSearchStates(stateRef.current, {
        searches: [],
        tombstones: [tombstone],
      });
      applyState(next);
      return !next.searches.some((search) => search.id === id);
    },
    [applyState],
  );

  const replaceSearches = useCallback(
    (replacement: SavedSearchReplacement): SavedSearchState => {
      const incoming = mergeSavedSearchStates(
        isSavedSearchState(replacement)
          ? replacement
          : { searches: [...replacement], tombstones: [] },
      );
      const incomingIds = new Set(
        incoming.searches.map((search) => search.id),
      );
      const deletionTime = timestampAfter(
        ...stateRef.current.searches.map((search) => search.updatedAt),
        ...stateRef.current.tombstones.map(
          (tombstone) => tombstone.deletedAt,
        ),
      );
      const removed = stateRef.current.searches
        .filter((search) => !incomingIds.has(search.id))
        .map(
          (search): SavedSearchTombstone => ({
            id: search.id,
            deletedAt: deletionTime,
          }),
        );

      const next = mergeSavedSearchStates(stateRef.current, incoming, {
        searches: [],
        tombstones: removed,
      });
      return applyState(next);
    },
    [applyState],
  );

  return {
    searches: state.searches,
    tombstones: state.tombstones,
    ready,
    createSearch,
    editSearch,
    pauseSearch,
    deleteSearch,
    replaceSearches,
  };
}
