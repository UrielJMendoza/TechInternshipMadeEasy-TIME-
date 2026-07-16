"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TrackingKeyAliasMap } from "@/lib/applicationTracking";
import {
  LEGACY_SAVED_STORAGE_KEY,
  SAVED_BROADCAST_CHANNEL,
  SAVED_STORAGE_KEY,
  createEmptySavedStore,
  mergeSavedStores,
  migrateSavedTracking,
  parseSavedStore,
  recoverUnmatchedSavedRecords,
  savedStoresEqual,
  savedTrackingKeys,
  serializeSavedStore,
  setSavedState,
  toggleSavedState,
  unmatchedSavedKeys,
  type SavedStoreV2,
} from "@/lib/savedTracking";

const EMPTY_TRACKING_ALIASES: TrackingKeyAliasMap = Object.freeze({});

export interface SavedTrackingState {
  saved: Set<string>;
  unmatchedSaved: Set<string>;
  store: SavedStoreV2;
  ready: boolean;
  storageAvailable: boolean | null;
  toggleSaved: (trackingKey: string) => void;
  setSaved: (trackingKey: string, saved: boolean) => void;
  importStore: (imported: SavedStoreV2) => void;
}

/** Stable-key saved state with v1 URL recovery and cross-tab merging. */
export function useSavedTracking(
  urlToTrackingKey: TrackingKeyAliasMap = EMPTY_TRACKING_ALIASES,
): SavedTrackingState {
  const [store, setStore] = useState<SavedStoreV2>(createEmptySavedStore);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState<boolean | null>(null);
  const storeRef = useRef(store);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const replaceStore = useCallback((next: SavedStoreV2) => {
    storeRef.current = next;
    setStore(next);
  }, []);

  const persist = useCallback((next: SavedStoreV2) => {
    const serialized = serializeSavedStore(next);
    try {
      localStorage.setItem(SAVED_STORAGE_KEY, serialized);
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
    try {
      channelRef.current?.postMessage(serialized);
    } catch {
      // BroadcastChannel is optional; storage events remain the fallback.
    }
  }, []);

  const commit = useCallback(
    (update: (current: SavedStoreV2) => SavedStoreV2) => {
      let current = storeRef.current;
      try {
        const disk = localStorage.getItem(SAVED_STORAGE_KEY);
        if (disk !== null) {
          const recoveredDisk = recoverUnmatchedSavedRecords(
            parseSavedStore(disk),
            urlToTrackingKey,
          ).store;
          current = mergeSavedStores(current, recoveredDisk);
        }
      } catch {
        setStorageAvailable(false);
      }
      const next = update(current);
      if (savedStoresEqual(storeRef.current, next)) return;
      replaceStore(next);
      persist(next);
    },
    [persist, replaceStore, urlToTrackingKey],
  );

  useEffect(() => {
    let initial = recoverUnmatchedSavedRecords(
      storeRef.current,
      urlToTrackingKey,
    ).store;
    let canUseStorage = true;
    try {
      const v2Raw = localStorage.getItem(SAVED_STORAGE_KEY);
      const migration = migrateSavedTracking(
        v2Raw,
        localStorage.getItem(LEGACY_SAVED_STORAGE_KEY),
        urlToTrackingKey,
      );
      const diskStore = migration.store;
      initial = mergeSavedStores(initial, diskStore);
      if (migration.shouldPersist || !savedStoresEqual(diskStore, initial)) {
        localStorage.setItem(SAVED_STORAGE_KEY, serializeSavedStore(initial));
      }
      if (v2Raw !== null || migration.shouldPersist) {
        localStorage.removeItem(LEGACY_SAVED_STORAGE_KEY);
      }
    } catch {
      canUseStorage = false;
    }

    const storeChanged = !savedStoresEqual(storeRef.current, initial);
    storeRef.current = initial;
    // Intentional browser-owned hydration after the server render.
    if (storeChanged) setStore(initial);
    setStorageAvailable(canUseStorage);
    setReady(true);

    const converge = (incoming: SavedStoreV2) => {
      const recovered = recoverUnmatchedSavedRecords(
        incoming,
        urlToTrackingKey,
      ).store;
      const merged = mergeSavedStores(storeRef.current, recovered);
      if (savedStoresEqual(storeRef.current, merged)) return;
      storeRef.current = merged;
      setStore(merged);
      if (!savedStoresEqual(recovered, merged)) persist(merged);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== SAVED_STORAGE_KEY || event.newValue === null) return;
      converge(parseSavedStore(event.newValue));
    };
    window.addEventListener("storage", onStorage);

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(SAVED_BROADCAST_CHANNEL);
        channelRef.current = channel;
        channel.addEventListener("message", (event: MessageEvent<unknown>) => {
          if (typeof event.data === "string") converge(parseSavedStore(event.data));
        });
      }
    } catch {
      channel = null;
    }

    return () => {
      window.removeEventListener("storage", onStorage);
      channel?.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [persist, urlToTrackingKey]);

  const toggleSaved = useCallback(
    (trackingKey: string) => {
      commit((current) => toggleSavedState(current, trackingKey));
    },
    [commit],
  );
  const updateSaved = useCallback(
    (trackingKey: string, saved: boolean) => {
      commit((current) => setSavedState(current, trackingKey, saved));
    },
    [commit],
  );
  const importStore = useCallback(
    (imported: SavedStoreV2) => {
      commit((current) => mergeSavedStores(current, imported));
    },
    [commit],
  );

  const saved = useMemo(() => savedTrackingKeys(store), [store]);
  const unmatchedSaved = useMemo(() => unmatchedSavedKeys(store), [store]);

  return {
    saved,
    unmatchedSaved,
    store,
    ready,
    storageAvailable,
    toggleSaved,
    setSaved: updateSaved,
    importStore,
  };
}

/** Generic compatibility hook for non-tracking string sets. */
export function usePersistentSet(
  key: string,
): [Set<string>, (id: string) => void, boolean] {
  const [values, setValues] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem(key);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        setValues(
          new Set(
            Array.isArray(parsed)
              ? parsed.filter((item): item is string => typeof item === "string")
              : [],
          ),
        );
      } catch {
        setValues(new Set());
      }
      setReady(true);
    };
    read();
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) read();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const toggle = useCallback(
    (id: string) => {
      setValues((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          // Keep the in-memory update if storage is unavailable.
        }
        return next;
      });
    },
    [key],
  );

  return [values, toggle, ready];
}

export function usePersistentString<T extends string>(
  key: string,
  fallback: T,
  isValid: (value: string) => value is T,
): [T, (value: T) => void, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        const stored = localStorage.getItem(key);
        // This is an intentional post-SSR hydration from browser-owned state.
        if (stored && isValid(stored)) setValue(stored);
      } catch {
        // Use the fallback when storage is unavailable.
      }
      setReady(true);
    };
    read();
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) read();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [isValid, key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // Keep the in-memory update if storage is unavailable.
      }
    },
    [key],
  );

  return [value, update, ready];
}
