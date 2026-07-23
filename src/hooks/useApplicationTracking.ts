"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONTINUITY_LOCAL_CHANGE_EVENT,
  dispatchContinuityLocalChange,
  readContinuityLocalChange,
} from "@/components/ContinuityProvider";
import {
  APPLICATION_STORAGE_KEY,
  LEGACY_APPLICATION_STORAGE_KEY,
  LEGACY_APPLIED_STORAGE_KEY,
  LEGACY_SAVED_STORAGE_KEY,
  applicationSnapshotFromJob,
  ensureSavedApplication,
  getApplicationStage,
  mergeApplicationRecords,
  migrateApplicationRecords,
  resetApplicationStage,
  restoreApplicationRecord,
  serializeApplicationRecords,
  setApplicationStage,
  updateApplicationRecord,
  type ApplicationRecord,
  type ApplicationRecordInput,
  type ApplicationRecordPatch,
  type ApplicationRecords,
  type ApplicationStage,
} from "@/lib/applicationTracking";
import {
  APPLICATION_TOMBSTONE_STORAGE_KEY,
  applyApplicationTombstones,
  nextContinuityTimestamp,
  parseApplicationTombstones,
  recordApplicationTombstone,
  serializeApplicationTombstones,
  type ContinuityTimestampMap,
} from "@/lib/continuitySnapshot";
import type { Internship } from "@/lib/types";

const EMPTY_JOBS: readonly Internship[] = [];

function createManualKey(): string {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `manual:${randomId}`;
}

function usableKey(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (
    !trimmed ||
    trimmed.length > 4096 ||
    /[\u0000-\u001f\u007f]/.test(trimmed) ||
    ["__proto__", "constructor", "prototype"].includes(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

export function useApplicationTracking(jobs: readonly Internship[] = EMPTY_JOBS) {
  const [records, setRecords] = useState<ApplicationRecords>({});
  const [ready, setReady] = useState(false);
  const recordsRef = useRef<ApplicationRecords>({});
  const tombstonesRef = useRef<ContinuityTimestampMap>({});
  const jobsRef = useRef<readonly Internship[]>(jobs);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const persist = useCallback(
    (
      next: ApplicationRecords,
      tombstones: ContinuityTimestampMap,
    ) => {
      try {
        const serializedTombstones =
          serializeApplicationTombstones(tombstones);
        const serializedRecords = serializeApplicationRecords(next);
        const tombstonesChanged =
          localStorage.getItem(APPLICATION_TOMBSTONE_STORAGE_KEY) !==
          serializedTombstones;
        const recordsChanged =
          localStorage.getItem(APPLICATION_STORAGE_KEY) !==
          serializedRecords;
        if (!tombstonesChanged && !recordsChanged) return;

        // Persist the delete marker first. Another tab can temporarily hide an
        // old live record, but can never observe a deletion without its marker.
        if (tombstonesChanged) {
          localStorage.setItem(
            APPLICATION_TOMBSTONE_STORAGE_KEY,
            serializedTombstones,
          );
        }
        if (recordsChanged) {
          localStorage.setItem(
            APPLICATION_STORAGE_KEY,
            serializedRecords,
          );
        }
        dispatchContinuityLocalChange("applications");
      } catch {
        // Keep the in-memory state if storage is unavailable.
      }
    },
    [],
  );

  const commit = useCallback(
    (
      update: (
        current: ApplicationRecords,
        tombstones: ContinuityTimestampMap,
      ) => {
        records: ApplicationRecords;
        tombstones: ContinuityTimestampMap;
      },
    ): ApplicationRecords => {
      const current = recordsRef.current;
      const currentTombstones = tombstonesRef.current;
      const next = update(current, currentTombstones);
      if (
        next.records === current &&
        next.tombstones === currentTombstones
      ) {
        return current;
      }
      recordsRef.current = next.records;
      tombstonesRef.current = next.tombstones;
      if (next.records !== current) setRecords(next.records);
      persist(next.records, next.tombstones);
      return next.records;
    },
    [persist],
  );

  useEffect(() => {
    const read = () => {
      try {
        const migration = migrateApplicationRecords({
          v3Raw: localStorage.getItem(APPLICATION_STORAGE_KEY),
          v2Raw: localStorage.getItem(LEGACY_APPLICATION_STORAGE_KEY),
          legacyAppliedRaw: localStorage.getItem(LEGACY_APPLIED_STORAGE_KEY),
          savedRaw: localStorage.getItem(LEGACY_SAVED_STORAGE_KEY),
          jobs: jobsRef.current,
        });
        const tombstones = parseApplicationTombstones(
          localStorage.getItem(APPLICATION_TOMBSTONE_STORAGE_KEY),
        );
        const nextRecords = applyApplicationTombstones(
          migration.records,
          tombstones,
        );
        tombstonesRef.current = tombstones;
        recordsRef.current = nextRecords;
        setRecords(nextRecords);
        if (
          migration.shouldPersist ||
          Object.keys(nextRecords).length !==
            Object.keys(migration.records).length
        ) {
          persist(nextRecords, tombstones);
        }
      } catch {
        tombstonesRef.current = {};
        recordsRef.current = {};
        setRecords({});
      }
      setReady(true);
    };

    read();
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === APPLICATION_STORAGE_KEY ||
        event.key === APPLICATION_TOMBSTONE_STORAGE_KEY
      ) {
        read();
      }
    };
    const onContinuityChange = (event: Event) => {
      const detail = readContinuityLocalChange(event);
      if (detail?.category === "applications" && detail.source === "sync") {
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
  }, [persist]);

  const findJob = useCallback((jobKey: string, supplied?: Internship) => {
    if (supplied) return supplied;
    return jobsRef.current.find(
      (job) => job.link === jobKey || job.canonical_url === jobKey,
    );
  }, []);

  const resolveRecordKey = useCallback((jobKey: string): string => {
    if (Object.hasOwn(recordsRef.current, jobKey)) return jobKey;
    return (
      Object.entries(recordsRef.current).find(
        ([, record]) => record.applicationUrl === jobKey,
      )?.[0] ?? jobKey
    );
  }, []);

  const updateStage = useCallback(
    (jobKey: string, stage: ApplicationStage, job?: Internship) => {
      const recordKey = resolveRecordKey(jobKey);
      const matchedJob = findJob(jobKey, job);
      const snapshot = matchedJob
        ? applicationSnapshotFromJob(matchedJob)
        : undefined;
      commit((current, tombstones) => {
        if (stage === "not_applied") {
          const deletedAt = nextContinuityTimestamp(
            current[recordKey]?.updatedAt,
            tombstones[recordKey],
          );
          return {
            records: resetApplicationStage(current, recordKey),
            tombstones: recordApplicationTombstone(
              tombstones,
              recordKey,
              deletedAt,
            ),
          };
        }
        const changedAt = nextContinuityTimestamp(
          current[recordKey]?.updatedAt,
          tombstones[recordKey],
        );
        return {
          records: setApplicationStage(
            current,
            recordKey,
            stage,
            changedAt,
            snapshot,
          ),
          tombstones,
        };
      });
    },
    [commit, findJob, resolveRecordKey],
  );

  const updateRecord = useCallback(
    (jobKey: string, patch: ApplicationRecordPatch) => {
      commit((current, tombstones) => ({
        records: updateApplicationRecord(
          current,
          jobKey,
          patch,
          nextContinuityTimestamp(
            current[jobKey]?.updatedAt,
            tombstones[jobKey],
          ),
        ),
        tombstones,
      }));
    },
    [commit],
  );

  const createRecord = useCallback(
    (input: ApplicationRecordInput): string => {
      const requestedKey =
        usableKey(input.jobKey) ??
        usableKey(input.applicationUrl) ??
        usableKey(input.job?.link) ??
        createManualKey();
      const jobKey = resolveRecordKey(requestedKey);
      const matchedJob = findJob(jobKey, input.job);
      const snapshot = matchedJob
        ? applicationSnapshotFromJob(matchedJob)
        : undefined;
      const {
        job: _job,
        jobKey: _jobKey,
        ...recordPatch
      } = input;
      void _job;
      void _jobKey;

      commit((current, tombstones) => {
        if (current[jobKey]) {
          return { records: current, tombstones };
        }
        const changedAt = nextContinuityTimestamp(
          tombstones[jobKey],
        );
        const next = setApplicationStage(
          current,
          jobKey,
          input.stage ?? "saved",
          changedAt,
          snapshot,
        );
        return {
          records: updateApplicationRecord(
            next,
            jobKey,
            recordPatch,
            changedAt,
          ),
          tombstones,
        };
      });
      return jobKey;
    },
    [commit, findJob, resolveRecordKey],
  );

  const deleteRecord = useCallback(
    (jobKey: string): ApplicationRecord | undefined => {
      const deleted = recordsRef.current[jobKey];
      if (deleted) {
        commit((current, tombstones) => {
          const deletedAt = nextContinuityTimestamp(
            current[jobKey]?.updatedAt,
            tombstones[jobKey],
          );
          return {
            records: resetApplicationStage(current, jobKey),
            tombstones: recordApplicationTombstone(
              tombstones,
              jobKey,
              deletedAt,
            ),
          };
        });
      }
      return deleted;
    },
    [commit],
  );

  const restoreRecord = useCallback(
    (jobKey: string, record: ApplicationRecord) => {
      commit((current, tombstones) => ({
        records: restoreApplicationRecord(current, jobKey, {
          ...record,
          updatedAt: nextContinuityTimestamp(
            record.updatedAt,
            tombstones[jobKey],
          ),
        }),
        tombstones,
      }));
    },
    [commit],
  );

  const mergeRecords = useCallback(
    (incoming: ApplicationRecords) => {
      commit((current, tombstones) => ({
        records: applyApplicationTombstones(
          mergeApplicationRecords(current, incoming),
          tombstones,
        ),
        tombstones,
      }));
    },
    [commit],
  );

  const ensureSaved = useCallback(
    (jobKey: string, job?: Internship) => {
      const recordKey = resolveRecordKey(jobKey);
      const matchedJob = findJob(jobKey, job);
      const snapshot = matchedJob
        ? applicationSnapshotFromJob(matchedJob)
        : undefined;
      commit((current, tombstones) => ({
        records: ensureSavedApplication(
          current,
          recordKey,
          nextContinuityTimestamp(
            current[recordKey]?.updatedAt,
            tombstones[recordKey],
          ),
          snapshot,
        ),
        tombstones,
      }));
    },
    [commit, findJob, resolveRecordKey],
  );

  const stageFor = useCallback(
    (jobKey: string) => getApplicationStage(records, jobKey),
    [records],
  );

  return {
    records,
    ready,
    stageFor,
    updateStage,
    updateRecord,
    createRecord,
    deleteRecord,
    restoreRecord,
    mergeRecords,
    ensureSaved,
  };
}
