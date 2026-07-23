"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONTINUITY_LOCAL_CHANGE_EVENT,
  dispatchContinuityLocalChange,
  readContinuityLocalChange,
} from "@/components/ContinuityProvider";
import { LEGACY_SAVED_STORAGE_KEY } from "@/lib/applicationTracking";
import {
  SAVED_JOB_TOMBSTONE_STORAGE_KEY,
  SAVED_JOB_UPDATED_AT_STORAGE_KEY,
  nextContinuityTimestamp,
  parseSavedJobTombstones,
  parseSavedJobUpdatedAt,
  recordSavedJobTimestamp,
  recordSavedJobTombstone,
  resolveSavedJobContinuityState,
  serializeSavedJobTombstones,
  serializeSavedJobUpdatedAt,
  type ContinuityTimestampMap,
} from "@/lib/continuitySnapshot";

export function usePersistentSet(
  key: string,
): [Set<string>, (id: string) => void, boolean] {
  const [values, setValues] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const savedUpdatedAtRef = useRef<ContinuityTimestampMap>({});
  const savedTombstonesRef = useRef<ContinuityTimestampMap>({});

  const persistSavedState = useCallback(
    (
      nextValues: Set<string>,
      updatedAt: ContinuityTimestampMap,
      tombstones: ContinuityTimestampMap,
    ) => {
      const serializedTombstones =
        serializeSavedJobTombstones(tombstones);
      const serializedUpdatedAt =
        serializeSavedJobUpdatedAt(updatedAt);
      const serializedValues = JSON.stringify([...nextValues]);
      const tombstonesChanged =
        localStorage.getItem(SAVED_JOB_TOMBSTONE_STORAGE_KEY) !==
        serializedTombstones;
      const updatedAtChanged =
        localStorage.getItem(SAVED_JOB_UPDATED_AT_STORAGE_KEY) !==
        serializedUpdatedAt;
      const valuesChanged =
        localStorage.getItem(LEGACY_SAVED_STORAGE_KEY) !==
        serializedValues;
      if (!tombstonesChanged && !updatedAtChanged && !valuesChanged) {
        return;
      }
      if (tombstonesChanged) {
        localStorage.setItem(
          SAVED_JOB_TOMBSTONE_STORAGE_KEY,
          serializedTombstones,
        );
      }
      if (updatedAtChanged) {
        localStorage.setItem(
          SAVED_JOB_UPDATED_AT_STORAGE_KEY,
          serializedUpdatedAt,
        );
      }
      if (valuesChanged) {
        localStorage.setItem(
          LEGACY_SAVED_STORAGE_KEY,
          serializedValues,
        );
      }
      dispatchContinuityLocalChange("savedJobs");
    },
    [],
  );

  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem(key);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        const parsedValues = Array.isArray(parsed)
          ? parsed.filter(
              (item): item is string => typeof item === "string",
            )
          : [];
        if (key === LEGACY_SAVED_STORAGE_KEY) {
          const updatedAt = parseSavedJobUpdatedAt(
            localStorage.getItem(SAVED_JOB_UPDATED_AT_STORAGE_KEY),
          );
          const tombstones = parseSavedJobTombstones(
            localStorage.getItem(SAVED_JOB_TOMBSTONE_STORAGE_KEY),
          );
          const resolved = resolveSavedJobContinuityState(
            parsedValues,
            updatedAt,
            tombstones,
            new Date().toISOString(),
          );
          savedUpdatedAtRef.current = resolved.updatedAt;
          savedTombstonesRef.current = resolved.tombstones;
          const resolvedValues = new Set(resolved.urls);
          setValues(resolvedValues);
          persistSavedState(
            resolvedValues,
            resolved.updatedAt,
            resolved.tombstones,
          );
        } else {
          setValues(new Set(parsedValues));
        }
      } catch {
        if (key === LEGACY_SAVED_STORAGE_KEY) {
          savedUpdatedAtRef.current = {};
          savedTombstonesRef.current = {};
        }
        setValues(new Set());
      }
      setReady(true);
    };
    read();
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === key ||
        (key === LEGACY_SAVED_STORAGE_KEY &&
          (event.key === SAVED_JOB_UPDATED_AT_STORAGE_KEY ||
            event.key === SAVED_JOB_TOMBSTONE_STORAGE_KEY))
      ) {
        read();
      }
    };
    const onContinuityChange = (event: Event) => {
      const detail = readContinuityLocalChange(event);
      if (
        key === LEGACY_SAVED_STORAGE_KEY &&
        detail?.category === "savedJobs" &&
        detail.source === "sync"
      ) {
        read();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(
      CONTINUITY_LOCAL_CHANGE_EVENT,
      onContinuityChange,
    );
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        CONTINUITY_LOCAL_CHANGE_EVENT,
        onContinuityChange,
      );
    };
  }, [key, persistSavedState]);

  const toggle = useCallback(
    (id: string) => {
      setValues((current) => {
        const next = new Set(current);
        const wasSaved = next.has(id);
        if (wasSaved) next.delete(id);
        else next.add(id);
        try {
          if (key === LEGACY_SAVED_STORAGE_KEY) {
            let updatedAt = savedUpdatedAtRef.current;
            let tombstones = savedTombstonesRef.current;
            const changedAt = nextContinuityTimestamp(
              updatedAt[id],
              tombstones[id],
            );
            if (wasSaved) {
              const nextUpdatedAt = { ...updatedAt };
              delete nextUpdatedAt[id];
              updatedAt = nextUpdatedAt;
              tombstones = recordSavedJobTombstone(
                tombstones,
                id,
                changedAt,
              );
            } else {
              updatedAt = recordSavedJobTimestamp(
                updatedAt,
                id,
                changedAt,
              );
            }
            const resolved = resolveSavedJobContinuityState(
              [...next],
              updatedAt,
              tombstones,
              changedAt,
            );
            const resolvedValues = new Set(resolved.urls);
            savedUpdatedAtRef.current = resolved.updatedAt;
            savedTombstonesRef.current = resolved.tombstones;
            persistSavedState(
              resolvedValues,
              resolved.updatedAt,
              resolved.tombstones,
            );
            return resolvedValues;
          }

          const serialized = JSON.stringify([...next]);
          if (localStorage.getItem(key) !== serialized) {
            localStorage.setItem(key, serialized);
          }
        } catch {
          // Keep the in-memory update if storage is unavailable.
        }
        return next;
      });
    },
    [key, persistSavedState],
  );

  return [values, toggle, ready];
}

export function usePersistentString<T extends string>(
  key: string,
  fallback: T,
  isValid: (value: string) => value is T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      // This is an intentional post-SSR hydration from browser-owned state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored && isValid(stored)) setValue(stored);
    } catch {
      // Use the fallback when storage is unavailable.
    }
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

  return [value, update];
}
