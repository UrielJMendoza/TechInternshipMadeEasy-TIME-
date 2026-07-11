"use client";

import { useCallback, useEffect, useState } from "react";
import {
  APPLICATION_STORAGE_KEY,
  LEGACY_APPLIED_STORAGE_KEY,
  getApplicationStage,
  migrateApplicationRecords,
  serializeApplicationRecords,
  setApplicationStage,
  type ApplicationRecords,
  type ApplicationStage,
} from "@/lib/applicationTracking";

export function useApplicationTracking() {
  const [records, setRecords] = useState<ApplicationRecords>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        const migration = migrateApplicationRecords(
          localStorage.getItem(APPLICATION_STORAGE_KEY),
          localStorage.getItem(LEGACY_APPLIED_STORAGE_KEY),
        );
        setRecords(migration.records);
        if (migration.shouldPersist) {
          localStorage.setItem(
            APPLICATION_STORAGE_KEY,
            serializeApplicationRecords(migration.records),
          );
        }
      } catch {
        setRecords({});
      }
      setReady(true);
    };

    read();
    const onStorage = (event: StorageEvent) => {
      if (event.key === APPLICATION_STORAGE_KEY) read();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const updateStage = useCallback((jobKey: string, stage: ApplicationStage) => {
    setRecords((current) => {
      const next = setApplicationStage(current, jobKey, stage);
      if (next === current) return current;
      try {
        localStorage.setItem(
          APPLICATION_STORAGE_KEY,
          serializeApplicationRecords(next),
        );
      } catch {
        // Keep the in-memory state if storage is unavailable.
      }
      return next;
    });
  }, []);

  const stageFor = useCallback(
    (jobKey: string) => getApplicationStage(records, jobKey),
    [records],
  );

  return { records, ready, stageFor, updateStage };
}
