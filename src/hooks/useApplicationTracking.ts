"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  APPLICATION_BROADCAST_CHANNEL,
  APPLICATION_STORAGE_KEY,
  APPLICATION_V2_STORAGE_KEY,
  LEGACY_APPLIED_STORAGE_KEY,
  applicationStoresEqual,
  createEmptyApplicationStore,
  getApplicationStage,
  mergeApplicationStores,
  migrateApplicationRecords,
  parseApplicationStore,
  recoverUnmatchedApplicationRecords,
  serializeApplicationStore,
  setApplicationStoreStage,
  updateApplicationRecordDetails,
  type ApplicationRecordDetailsPatch,
  type ApplicationStage,
  type ApplicationStoreV3,
  type TrackingKeyAliasMap,
} from "@/lib/applicationTracking";
import {
  exportApplicationTrackingCsv,
  exportApplicationTrackingJson,
  importApplicationTrackingCsv,
  importApplicationTrackingJson,
} from "@/lib/applicationTrackingTransfer";

const EMPTY_TRACKING_ALIASES: TrackingKeyAliasMap = Object.freeze({});

export interface ApplicationTrackingState {
  store: ApplicationStoreV3;
  records: ApplicationStoreV3["records"];
  unmatchedRecords: ApplicationStoreV3["unmatched"];
  ready: boolean;
  storageAvailable: boolean | null;
  stageFor: (trackingKey: string) => ApplicationStage;
  updateStage: (trackingKey: string, stage: ApplicationStage) => void;
  updateDetails: (
    trackingKey: string,
    patch: ApplicationRecordDetailsPatch,
  ) => void;
  exportJson: () => string;
  exportCsv: () => string;
  importJson: (raw: string) => void;
  importCsv: (raw: string) => void;
  importStore: (imported: ApplicationStoreV3) => void;
}

/**
 * Browser-owned application tracking keyed only by immutable tracking keys.
 * Storage and BroadcastChannel payloads are merged, not blindly replaced.
 */
export function useApplicationTracking(
  urlToTrackingKey: TrackingKeyAliasMap = EMPTY_TRACKING_ALIASES,
): ApplicationTrackingState {
  const [store, setStore] = useState<ApplicationStoreV3>(
    createEmptyApplicationStore,
  );
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState<boolean | null>(null);
  const storeRef = useRef<ApplicationStoreV3>(store);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const replaceStore = useCallback((next: ApplicationStoreV3) => {
    storeRef.current = next;
    setStore(next);
  }, []);

  const persist = useCallback((next: ApplicationStoreV3) => {
    const serialized = serializeApplicationStore(next);
    try {
      localStorage.setItem(APPLICATION_STORAGE_KEY, serialized);
      setStorageAvailable(true);
    } catch {
      // In-memory state and BroadcastChannel still work in restricted contexts.
      setStorageAvailable(false);
    }
    try {
      channelRef.current?.postMessage(serialized);
    } catch {
      // BroadcastChannel is an optional convergence accelerator.
    }
  }, []);

  const commit = useCallback(
    (update: (current: ApplicationStoreV3) => ApplicationStoreV3) => {
      let current = storeRef.current;
      try {
        const disk = localStorage.getItem(APPLICATION_STORAGE_KEY);
        if (disk !== null) {
          const recoveredDisk = recoverUnmatchedApplicationRecords(
            parseApplicationStore(disk),
            urlToTrackingKey,
          ).store;
          current = mergeApplicationStores(current, recoveredDisk);
        }
      } catch {
        setStorageAvailable(false);
      }
      const next = update(current);
      if (applicationStoresEqual(storeRef.current, next)) return;
      replaceStore(next);
      persist(next);
    },
    [persist, replaceStore, urlToTrackingKey],
  );

  useEffect(() => {
    let initial = recoverUnmatchedApplicationRecords(
      storeRef.current,
      urlToTrackingKey,
    ).store;
    let canUseStorage = true;
    try {
      const v3Raw = localStorage.getItem(APPLICATION_STORAGE_KEY);
      const migration = migrateApplicationRecords(
        v3Raw,
        localStorage.getItem(APPLICATION_V2_STORAGE_KEY),
        localStorage.getItem(LEGACY_APPLIED_STORAGE_KEY),
        urlToTrackingKey,
      );
      const diskStore = migration.store;
      initial = mergeApplicationStores(initial, diskStore);
      if (
        migration.shouldPersist ||
        !applicationStoresEqual(diskStore, initial)
      ) {
        localStorage.setItem(
          APPLICATION_STORAGE_KEY,
          serializeApplicationStore(initial),
        );
      }
      if (v3Raw !== null || migration.shouldPersist) {
        localStorage.removeItem(APPLICATION_V2_STORAGE_KEY);
        localStorage.removeItem(LEGACY_APPLIED_STORAGE_KEY);
      }
    } catch {
      canUseStorage = false;
    }

    const storeChanged = !applicationStoresEqual(storeRef.current, initial);
    storeRef.current = initial;
    // Intentional browser-owned hydration after the server render.
    if (storeChanged) setStore(initial);
    setStorageAvailable(canUseStorage);
    setReady(true);

    const converge = (incoming: ApplicationStoreV3) => {
      const recovered = recoverUnmatchedApplicationRecords(
        incoming,
        urlToTrackingKey,
      ).store;
      const merged = mergeApplicationStores(storeRef.current, recovered);
      if (applicationStoresEqual(storeRef.current, merged)) return;
      storeRef.current = merged;
      setStore(merged);
      // If this tab contributed newer records, write the union back so every
      // tab and future reload converges on the same envelope.
      if (!applicationStoresEqual(recovered, merged)) persist(merged);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== APPLICATION_STORAGE_KEY || event.newValue === null) return;
      converge(parseApplicationStore(event.newValue));
    };
    window.addEventListener("storage", onStorage);

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(APPLICATION_BROADCAST_CHANNEL);
        channelRef.current = channel;
        channel.addEventListener("message", (event: MessageEvent<unknown>) => {
          if (typeof event.data === "string") {
            converge(parseApplicationStore(event.data));
          }
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

  const updateStage = useCallback(
    (trackingKey: string, stage: ApplicationStage) => {
      commit((current) =>
        setApplicationStoreStage(current, trackingKey, stage),
      );
    },
    [commit],
  );

  const updateDetails = useCallback(
    (trackingKey: string, patch: ApplicationRecordDetailsPatch) => {
      commit((current) =>
        updateApplicationRecordDetails(current, trackingKey, patch),
      );
    },
    [commit],
  );

  const stageFor = useCallback(
    (trackingKey: string) => getApplicationStage(store.records, trackingKey),
    [store.records],
  );

  const exportJson = useCallback(
    () => exportApplicationTrackingJson(storeRef.current),
    [],
  );
  const exportCsv = useCallback(
    () => exportApplicationTrackingCsv(storeRef.current),
    [],
  );
  const importJson = useCallback(
    (raw: string) => {
      const imported = importApplicationTrackingJson(raw);
      commit((current) => mergeApplicationStores(current, imported));
    },
    [commit],
  );
  const importCsv = useCallback(
    (raw: string) => {
      const imported = importApplicationTrackingCsv(raw);
      commit((current) => mergeApplicationStores(current, imported));
    },
    [commit],
  );
  const importStore = useCallback(
    (imported: ApplicationStoreV3) => {
      commit((current) => mergeApplicationStores(current, imported));
    },
    [commit],
  );

  return {
    store,
    records: store.records,
    unmatchedRecords: store.unmatched,
    ready,
    storageAvailable,
    stageFor,
    updateStage,
    updateDetails,
    exportJson,
    exportCsv,
    importJson,
    importCsv,
    importStore,
  };
}
