"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { APPLICATION_STORAGE_KEY } from "@/lib/applicationTracking";
import { BOARD_FILTER_STORAGE_KEY } from "@/lib/boardFilterState";
import {
  createContinuityProvider,
  type ContinuityAuthOutcome,
  type ContinuityEmailInput,
  type ContinuityEmailPasswordInput,
  type ContinuityPasswordInput,
  type ContinuityProviderAdapter,
  type ContinuityProviderCapabilities,
  type ContinuityResult,
  type ContinuitySession,
  type ContinuityUser,
} from "@/lib/continuityProvider";
import {
  APPLICATION_TOMBSTONE_STORAGE_KEY,
  BOARD_FILTER_UPDATED_AT_STORAGE_KEY,
  CONTINUITY_SNAPSHOT_FORMAT,
  CONTINUITY_SNAPSHOT_VERSION,
  DEFAULT_SYNC_SELECTION,
  SAVED_JOB_TOMBSTONE_STORAGE_KEY,
  SAVED_JOB_UPDATED_AT_STORAGE_KEY,
  captureContinuitySnapshot,
  commitContinuitySnapshotToStorage,
  isSyncSelection,
  parseContinuityRecovery,
  parseContinuitySnapshot,
  prepareContinuitySync,
  serializeContinuityRecovery,
  summarizeContinuitySnapshot,
  type ContinuityRecoveryEnvelope,
  type ContinuitySnapshot,
  type ContinuitySnapshotSummary,
  type ContinuityStorageWriter,
  type SyncSelection,
} from "@/lib/continuitySnapshot";
import {
  SAVED_SEARCH_STORAGE_KEY,
  SAVED_SEARCH_TOMBSTONE_STORAGE_KEY,
} from "@/lib/savedSearches";

export const CONTINUITY_LOCAL_CHANGE_EVENT =
  "timley:continuity:local-change:v1";

const SAVED_JOB_STORAGE_KEY = "timley:saved";
const PREFERENCE_PREFIX = "timley:continuity:preference:v1";
const RECOVERY_PREFIX = "timley:continuity:recovery:v1";
const PREFERENCE_VERSION = 1;
const AUTO_SYNC_DEBOUNCE_MS = 1_200;

export type ContinuityCategory = keyof SyncSelection;
export type ContinuityLocalChangeSource = "local" | "sync";
export type ContinuityStatus =
  | "disabled"
  | "initializing"
  | "signed-out"
  | "signed-in"
  | "error";
export type ContinuitySyncStatus =
  | "idle"
  | "syncing"
  | "synced"
  | "error";
export type ContinuityRecoveryMode = "none" | "password-update";

export interface ContinuityLocalChangeDetail {
  category: ContinuityCategory;
  source: ContinuityLocalChangeSource;
}

export interface ContinuityRuntimeResult {
  ok: boolean;
  error?: string;
}

export interface PersistedContinuityPreference {
  version: typeof PREFERENCE_VERSION;
  consent: boolean;
  selection: SyncSelection;
  lastSyncedAt: string | null;
}

export interface ContinuityContextValue {
  configured: boolean;
  status: ContinuityStatus;
  session: ContinuitySession | null;
  recoveryMode: ContinuityRecoveryMode;
  capabilities: Readonly<ContinuityProviderCapabilities>;
  signUp(
    input: ContinuityEmailPasswordInput,
  ): Promise<ContinuityResult<ContinuityAuthOutcome>>;
  signIn(
    input: ContinuityEmailPasswordInput,
  ): Promise<ContinuityResult<ContinuityAuthOutcome>>;
  signOut(): Promise<ContinuityResult<void>>;
  resendSignUpVerification(
    input: ContinuityEmailInput,
  ): Promise<ContinuityResult<void>>;
  sendPasswordReset(
    input: ContinuityEmailInput,
  ): Promise<ContinuityResult<void>>;
  updatePassword(
    input: ContinuityPasswordInput,
  ): Promise<ContinuityResult<ContinuityUser>>;
  localSummary: ContinuitySnapshotSummary | null;
  syncSelection: SyncSelection;
  setSyncSelection(selection: SyncSelection): void;
  firstSync(): Promise<ContinuityRuntimeResult>;
  manualSync(): Promise<ContinuityRuntimeResult>;
  syncStatus: ContinuitySyncStatus;
  syncError: string | null;
  lastSyncedAt: string | null;
  recoveryAvailable: boolean;
  restoreRecovery(): Promise<ContinuityRuntimeResult>;
  deleteAccount(): Promise<ContinuityResult<void>>;
}

interface ContinuityProviderProps {
  children?: ReactNode;
  adapter?: ContinuityProviderAdapter;
}

interface TransactionalStorage {
  writer: ContinuityStorageWriter;
  changedKeys: ReadonlySet<string>;
  rollback(): boolean;
}

const ContinuityContext = createContext<ContinuityContextValue | null>(null);

const RELEVANT_STORAGE_KEYS = new Map<string, ContinuityCategory>([
  [SAVED_JOB_STORAGE_KEY, "savedJobs"],
  [SAVED_JOB_UPDATED_AT_STORAGE_KEY, "savedJobs"],
  [SAVED_JOB_TOMBSTONE_STORAGE_KEY, "savedJobs"],
  [APPLICATION_STORAGE_KEY, "applications"],
  [APPLICATION_TOMBSTONE_STORAGE_KEY, "applications"],
  [BOARD_FILTER_STORAGE_KEY, "filters"],
  [BOARD_FILTER_UPDATED_AT_STORAGE_KEY, "filters"],
  [SAVED_SEARCH_STORAGE_KEY, "savedSearches"],
  [SAVED_SEARCH_TOMBSTONE_STORAGE_KEY, "savedSearches"],
]);

function cloneSelection(selection: SyncSelection): SyncSelection {
  return {
    savedJobs: selection.savedJobs,
    applications: selection.applications,
    filters: selection.filters,
    savedSearches: selection.savedSearches,
  };
}

export function continuitySyncSelectionsEqual(
  left: SyncSelection,
  right: SyncSelection,
): boolean {
  return (
    left.savedJobs === right.savedJobs &&
    left.applications === right.applications &&
    left.filters === right.filters &&
    left.savedSearches === right.savedSearches
  );
}

export function continuityOperationStillCurrent({
  expectedUserId,
  expectedGeneration,
  expectedSelection,
  currentUserId,
  currentGeneration,
  currentSelection,
}: {
  expectedUserId: string;
  expectedGeneration: number;
  expectedSelection: SyncSelection;
  currentUserId: string | null;
  currentGeneration: number;
  currentSelection: SyncSelection;
}): boolean {
  return (
    expectedUserId === currentUserId &&
    expectedGeneration === currentGeneration &&
    continuitySyncSelectionsEqual(
      expectedSelection,
      currentSelection,
    )
  );
}

function normalizedTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  try {
    return new Date(milliseconds).toISOString();
  } catch {
    return null;
  }
}

function safeSubject(value: string): string {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(trimmed)
  ) {
    throw new TypeError("Invalid continuity subject.");
  }
  return encodeURIComponent(trimmed);
}

export function continuityPreferenceStorageKey(userId: string): string {
  return `${PREFERENCE_PREFIX}:${safeSubject(userId)}`;
}

export function continuityRecoveryStorageKey(userId: string): string {
  return `${RECOVERY_PREFIX}:${safeSubject(userId)}`;
}

export function parseContinuityPreference(
  raw: string | null,
): PersistedContinuityPreference | null {
  if (!raw || raw.length > 4_096) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value)
    ) {
      return null;
    }
    const candidate = value as Record<string, unknown>;
    const keys = Object.keys(candidate).sort();
    if (
      JSON.stringify(keys) !==
        JSON.stringify(
          ["consent", "lastSyncedAt", "selection", "version"].sort(),
        ) ||
      candidate.version !== PREFERENCE_VERSION ||
      typeof candidate.consent !== "boolean" ||
      !isSyncSelection(candidate.selection)
    ) {
      return null;
    }
    const lastSyncedAt =
      candidate.lastSyncedAt === null
        ? null
        : normalizedTimestamp(candidate.lastSyncedAt);
    if (candidate.lastSyncedAt !== null && !lastSyncedAt) return null;
    return {
      version: PREFERENCE_VERSION,
      consent: candidate.consent,
      selection: cloneSelection(candidate.selection),
      lastSyncedAt,
    };
  } catch {
    return null;
  }
}

export function serializeContinuityPreference(
  preference: PersistedContinuityPreference,
): string {
  const normalized = parseContinuityPreference(JSON.stringify(preference));
  if (!normalized) throw new TypeError("Invalid continuity preference.");
  return JSON.stringify(normalized);
}

export function readContinuityLocalChange(
  event: Event,
): ContinuityLocalChangeDetail | null {
  const detail = (event as CustomEvent<unknown>).detail;
  if (
    typeof detail !== "object" ||
    detail === null ||
    !("category" in detail) ||
    !("source" in detail)
  ) {
    return null;
  }
  const candidate = detail as Partial<ContinuityLocalChangeDetail>;
  if (
    !candidate.category ||
    !Object.hasOwn(DEFAULT_SYNC_SELECTION, candidate.category) ||
    (candidate.source !== "local" && candidate.source !== "sync")
  ) {
    return null;
  }
  return {
    category: candidate.category,
    source: candidate.source,
  };
}

export function dispatchContinuityLocalChange(
  category: ContinuityCategory,
  source: ContinuityLocalChangeSource = "local",
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ContinuityLocalChangeDetail>(
      CONTINUITY_LOCAL_CHANGE_EVENT,
      { detail: { category, source } },
    ),
  );
}

export function shouldScheduleAutomaticSync({
  configured,
  hasSession,
  consent,
  visible,
}: {
  configured: boolean;
  hasSession: boolean;
  consent: boolean;
  visible: boolean;
}): boolean {
  return configured && hasSession && consent && visible;
}

export function continuitySelectedCategoriesEqual(
  left: ContinuitySnapshot,
  right: ContinuitySnapshot,
): boolean {
  try {
    return JSON.stringify(left.categories) === JSON.stringify(right.categories);
  } catch {
    return false;
  }
}

function emptySnapshot(capturedAt: string): ContinuitySnapshot {
  return {
    format: CONTINUITY_SNAPSHOT_FORMAT,
    version: CONTINUITY_SNAPSHOT_VERSION,
    capturedAt,
    categories: {},
  };
}

function createTransactionalStorage(storage: Storage): TransactionalStorage {
  const originals = new Map<string, string | null>();
  const changedKeys = new Set<string>();
  const order: string[] = [];
  const writer: ContinuityStorageWriter = {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => {
      const current = storage.getItem(key);
      if (current === value) return;
      if (!originals.has(key)) {
        originals.set(key, current);
        order.push(key);
      }
      storage.setItem(key, value);
      changedKeys.add(key);
    },
  };

  return {
    writer,
    changedKeys,
    rollback: () => {
      let restored = true;
      for (const key of [...order].reverse()) {
        try {
          const original = originals.get(key);
          if (original === null || original === undefined) {
            storage.removeItem(key);
          } else {
            storage.setItem(key, original);
          }
        } catch {
          restored = false;
        }
      }
      return restored;
    },
  };
}

function changedCategories(
  keys: ReadonlySet<string>,
): ContinuityCategory[] {
  return [
    ...new Set(
      [...keys]
        .map((key) => RELEVANT_STORAGE_KEYS.get(key))
        .filter(
          (category): category is ContinuityCategory =>
            category !== undefined,
        ),
    ),
  ];
}

function runtimeFailure(error: string): ContinuityRuntimeResult {
  return { ok: false, error };
}

export function ContinuityProvider({
  children,
  adapter: suppliedAdapter,
}: ContinuityProviderProps) {
  const [adapter] = useState(
    () => suppliedAdapter ?? createContinuityProvider(),
  );
  const configured = adapter.available;
  const [status, setStatus] = useState<ContinuityStatus>(
    configured ? "initializing" : "disabled",
  );
  const [session, setSession] = useState<ContinuitySession | null>(null);
  const [recoveryMode, setRecoveryMode] =
    useState<ContinuityRecoveryMode>("none");
  const [localSummary, setLocalSummary] =
    useState<ContinuitySnapshotSummary | null>(null);
  const [syncSelection, setSyncSelectionState] = useState<SyncSelection>(
    cloneSelection(DEFAULT_SYNC_SELECTION),
  );
  const [syncStatus, setSyncStatus] =
    useState<ContinuitySyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);

  const sessionRef = useRef<ContinuitySession | null>(null);
  const selectionRef = useRef<SyncSelection>(
    cloneSelection(DEFAULT_SYNC_SELECTION),
  );
  const consentRef = useRef(false);
  const lastSyncedAtRef = useRef<string | null>(null);
  const recoveryRef = useRef<ContinuityRecoveryEnvelope | null>(null);
  const authGenerationRef = useRef(0);
  const syncInFlightRef =
    useRef<Promise<ContinuityRuntimeResult> | null>(null);
  const localChangedDuringSyncRef = useRef(false);
  const queuedAutomaticSyncRef = useRef(false);
  const automaticTimerRef = useRef<number | null>(null);
  const performSyncRef = useRef<
    ((trigger: "explicit" | "automatic") => Promise<ContinuityRuntimeResult>) | null
  >(null);

  const persistPreference = useCallback(
    (
      userId: string,
      consent: boolean,
      selection: SyncSelection,
      syncedAt: string | null,
    ): boolean => {
      if (typeof window === "undefined") return false;
      try {
        window.localStorage.setItem(
          continuityPreferenceStorageKey(userId),
          serializeContinuityPreference({
            version: PREFERENCE_VERSION,
            consent,
            selection: cloneSelection(selection),
            lastSyncedAt: syncedAt,
          }),
        );
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const refreshLocalSummary = useCallback(
    (selection = selectionRef.current) => {
      if (!configured || typeof window === "undefined") return;
      try {
        setLocalSummary(
          summarizeContinuitySnapshot(
            captureContinuitySnapshot(
              window.localStorage,
              selection,
            ),
          ),
        );
      } catch {
        setLocalSummary(null);
      }
    },
    [configured],
  );

  const applySession = useCallback(
    (nextSession: ContinuitySession | null) => {
      const previousUserId = sessionRef.current?.user.id ?? null;
      const nextUserId = nextSession?.user.id ?? null;
      sessionRef.current = nextSession;
      setSession(nextSession);
      setStatus(nextSession ? "signed-in" : "signed-out");

      if (previousUserId !== nextUserId) {
        authGenerationRef.current += 1;
        localChangedDuringSyncRef.current = true;
        queuedAutomaticSyncRef.current = false;
        if (
          automaticTimerRef.current !== null &&
          typeof window !== "undefined"
        ) {
          window.clearTimeout(automaticTimerRef.current);
          automaticTimerRef.current = null;
        }
        consentRef.current = false;
        selectionRef.current = cloneSelection(DEFAULT_SYNC_SELECTION);
        lastSyncedAtRef.current = null;
        recoveryRef.current = null;
        setSyncSelectionState(cloneSelection(DEFAULT_SYNC_SELECTION));
        setLastSyncedAt(null);
        setRecoveryAvailable(false);
        setSyncStatus("idle");
        setSyncError(null);
        setRecoveryMode("none");
      }
    },
    [],
  );

  /* eslint-disable react-hooks/set-state-in-effect -- external auth/storage hydration */
  useEffect(() => {
    if (!configured) return;
    let active = true;
    let unsubscribe: () => void = () => undefined;

    try {
      unsubscribe = adapter.onAuthStateChange((authState) => {
        if (!active) return;
        applySession(authState.session);
        if (authState.event === "PASSWORD_RECOVERY") {
          setRecoveryMode("password-update");
        }
      });
    } catch {
      setStatus("error");
      return;
    }

    void adapter.getSession().then((result) => {
      if (!active) return;
      if (result.ok) {
        applySession(result.data);
      } else {
        setStatus("error");
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [adapter, applySession, configured]);

  const sessionUserId = session?.user.id ?? null;
  useEffect(() => {
    if (!configured || !sessionUserId || typeof window === "undefined") {
      if (!sessionUserId) setLocalSummary(null);
      return;
    }

    const userId = sessionUserId;
    let preference: PersistedContinuityPreference | null = null;
    try {
      preference = parseContinuityPreference(
        window.localStorage.getItem(
          continuityPreferenceStorageKey(userId),
        ),
      );
    } catch {
      preference = null;
    }
    const selection = cloneSelection(
      preference?.selection ?? DEFAULT_SYNC_SELECTION,
    );
    const consent = preference?.consent ?? false;
    const syncedAt = preference?.lastSyncedAt ?? null;
    selectionRef.current = selection;
    consentRef.current = consent;
    lastSyncedAtRef.current = syncedAt;
    setSyncSelectionState(selection);
    setLastSyncedAt(syncedAt);

    try {
      const parsed = parseContinuityRecovery(
        window.localStorage.getItem(continuityRecoveryStorageKey(userId)),
      );
      recoveryRef.current = parsed.ok ? parsed.recovery : null;
      setRecoveryAvailable(parsed.ok);
    } catch {
      recoveryRef.current = null;
      setRecoveryAvailable(false);
    }
    refreshLocalSummary(selection);
  }, [configured, refreshLocalSummary, sessionUserId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const scheduleAutomaticSync = useCallback(() => {
    if (typeof window === "undefined") return;
    if (
      !shouldScheduleAutomaticSync({
        configured,
        hasSession: Boolean(sessionRef.current),
        consent: consentRef.current,
        visible:
          typeof document === "undefined" ||
          document.visibilityState === "visible",
      })
    ) {
      return;
    }
    if (automaticTimerRef.current !== null) {
      window.clearTimeout(automaticTimerRef.current);
    }
    automaticTimerRef.current = window.setTimeout(() => {
      automaticTimerRef.current = null;
      void performSyncRef.current?.("automatic");
    }, AUTO_SYNC_DEBOUNCE_MS);
  }, [configured]);

  const performSync = useCallback(
    (
      trigger: "explicit" | "automatic",
    ): Promise<ContinuityRuntimeResult> => {
      if (syncInFlightRef.current) return syncInFlightRef.current;

      const operation = (async (): Promise<ContinuityRuntimeResult> => {
        let operationIsCurrent = () => true;
        try {
          const activeSession = sessionRef.current;
          if (!configured || !activeSession) {
            const message = "Sign in to sync this browser.";
            setSyncStatus("error");
            setSyncError(message);
            return runtimeFailure(message);
          }
          if (trigger === "automatic" && !consentRef.current) {
            return runtimeFailure("Automatic sync has not been enabled.");
          }
          if (typeof window === "undefined") {
            return runtimeFailure("Browser storage is unavailable.");
          }
          const expectedUserId = activeSession.user.id;
          const expectedGeneration = authGenerationRef.current;
          const selection = cloneSelection(selectionRef.current);
          operationIsCurrent = () =>
            continuityOperationStillCurrent({
              expectedUserId,
              expectedGeneration,
              expectedSelection: selection,
              currentUserId:
                sessionRef.current?.user.id ?? null,
              currentGeneration: authGenerationRef.current,
              currentSelection: selectionRef.current,
            });
          const staleOperation = () =>
            runtimeFailure(
              "The active account or sync choices changed. Sync was stopped safely.",
            );

          setSyncStatus("syncing");
          setSyncError(null);
          const remoteResult = await adapter.readSnapshot<unknown>({
            expectedUserId,
            selection,
          });
          if (!operationIsCurrent()) return staleOperation();
          if (!remoteResult.ok) {
            setSyncStatus("error");
            setSyncError(remoteResult.error.message);
            return runtimeFailure(remoteResult.error.message);
          }

          const timestamp = new Date().toISOString();
          let remoteSnapshot = emptySnapshot(timestamp);
          if (remoteResult.data) {
            if (
              remoteResult.data.version !== CONTINUITY_SNAPSHOT_VERSION
            ) {
              const message =
                "The account snapshot uses an unsupported version.";
              setSyncStatus("error");
              setSyncError(message);
              return runtimeFailure(message);
            }
            const parsed = parseContinuitySnapshot(
              remoteResult.data.data,
            );
            if (!parsed.ok) {
              setSyncStatus("error");
              setSyncError(parsed.error);
              return runtimeFailure(parsed.error);
            }
            remoteSnapshot = parsed.snapshot;
          }

          const localBefore = captureContinuitySnapshot(
            window.localStorage,
            selection,
            timestamp,
          );
          localChangedDuringSyncRef.current = false;
          const prepared = prepareContinuitySync(
            localBefore,
            remoteSnapshot,
            selection,
            timestamp,
          );
          if (!prepared.ok) {
            setSyncStatus("error");
            setSyncError(prepared.error);
            return runtimeFailure(prepared.error);
          }

          if (!operationIsCurrent()) return staleOperation();
          const recoveryKey = continuityRecoveryStorageKey(
            expectedUserId,
          );
          try {
            window.localStorage.setItem(
              recoveryKey,
              serializeContinuityRecovery(prepared.plan.recovery),
            );
          } catch {
            const message =
              "A local recovery copy could not be saved, so sync was stopped.";
            setSyncStatus("error");
            setSyncError(message);
            return runtimeFailure(message);
          }
          recoveryRef.current = prepared.plan.recovery;
          setRecoveryAvailable(true);

          if (!operationIsCurrent()) return staleOperation();
          const uploaded = await adapter.upsertSnapshot({
            expectedUserId,
            selection,
            version: CONTINUITY_SNAPSHOT_VERSION,
            data: prepared.plan.upload,
          });
          if (!operationIsCurrent()) return staleOperation();
          if (!uploaded.ok) {
            setSyncStatus("error");
            setSyncError(uploaded.error.message);
            return runtimeFailure(uploaded.error.message);
          }

          const currentLocal = captureContinuitySnapshot(
            window.localStorage,
            selection,
            localBefore.capturedAt,
          );
          if (
            localChangedDuringSyncRef.current ||
            !continuitySelectedCategoriesEqual(
              localBefore,
              currentLocal,
            )
          ) {
            const message =
              "Local data changed during sync. Nothing local was replaced; sync again to include the new change.";
            setSyncStatus("error");
            setSyncError(message);
            queuedAutomaticSyncRef.current = true;
            return runtimeFailure(message);
          }

          if (!operationIsCurrent()) return staleOperation();
          const transaction = createTransactionalStorage(
            window.localStorage,
          );
          const committed = commitContinuitySnapshotToStorage(
            transaction.writer,
            prepared.plan.mergedLocal,
            selection,
          );
          if (!committed.ok) {
            transaction.rollback();
            const message =
              committed.error ??
              "The merged account data could not be saved locally.";
            setSyncStatus("error");
            setSyncError(message);
            return runtimeFailure(message);
          }

          if (!operationIsCurrent()) {
            transaction.rollback();
            return staleOperation();
          }
          const syncedAt =
            normalizedTimestamp(uploaded.data.updatedAt) ?? timestamp;
          const consent =
            trigger === "explicit" ? true : consentRef.current;
          consentRef.current = consent;
          lastSyncedAtRef.current = syncedAt;
          setLastSyncedAt(syncedAt);
          persistPreference(
            expectedUserId,
            consent,
            selection,
            syncedAt,
          );
          setSyncStatus("synced");
          setSyncError(null);
          refreshLocalSummary(selection);

          for (const category of changedCategories(
            transaction.changedKeys,
          )) {
            dispatchContinuityLocalChange(category, "sync");
          }
          return { ok: true };
        } catch {
          if (!operationIsCurrent()) {
            return runtimeFailure(
              "The active account or sync choices changed. Sync was stopped safely.",
            );
          }
          const message = "Continuity sync could not be completed.";
          setSyncStatus("error");
          setSyncError(message);
          return runtimeFailure(message);
        } finally {
          syncInFlightRef.current = null;
          if (queuedAutomaticSyncRef.current) {
            queuedAutomaticSyncRef.current = false;
            scheduleAutomaticSync();
          }
        }
      })();

      syncInFlightRef.current = operation;
      return operation;
    },
    [
      adapter,
      configured,
      persistPreference,
      refreshLocalSummary,
      scheduleAutomaticSync,
    ],
  );
  useEffect(() => {
    performSyncRef.current = performSync;
    return () => {
      if (performSyncRef.current === performSync) {
        performSyncRef.current = null;
      }
    };
  }, [performSync]);

  useEffect(() => {
    if (!configured || typeof window === "undefined") return;

    const noteChange = (
      category: ContinuityCategory | null,
      source: ContinuityLocalChangeSource,
    ) => {
      refreshLocalSummary();
      if (source === "sync") return;
      if (category && !selectionRef.current[category]) return;
      if (syncInFlightRef.current) {
        localChangedDuringSyncRef.current = true;
        queuedAutomaticSyncRef.current = true;
        return;
      }
      scheduleAutomaticSync();
    };

    const onLocalChange = (event: Event) => {
      const detail = readContinuityLocalChange(event);
      if (detail) noteChange(detail.category, detail.source);
    };
    const onStorage = (event: StorageEvent) => {
      const currentUserId = sessionRef.current?.user.id ?? null;
      if (currentUserId) {
        const preferenceKey =
          continuityPreferenceStorageKey(currentUserId);
        if (event.key === preferenceKey) {
          const preference = parseContinuityPreference(event.newValue);
          const nextSelection = cloneSelection(
            preference?.selection ?? DEFAULT_SYNC_SELECTION,
          );
          const nextConsent = preference?.consent ?? false;
          const nextLastSyncedAt =
            preference?.lastSyncedAt ?? null;
          if (
            nextConsent !== consentRef.current ||
            !continuitySyncSelectionsEqual(
              nextSelection,
              selectionRef.current,
            )
          ) {
            authGenerationRef.current += 1;
            localChangedDuringSyncRef.current = true;
            queuedAutomaticSyncRef.current = false;
            if (automaticTimerRef.current !== null) {
              window.clearTimeout(automaticTimerRef.current);
              automaticTimerRef.current = null;
            }
            setSyncStatus("idle");
            setSyncError(null);
          }
          consentRef.current = nextConsent;
          selectionRef.current = nextSelection;
          lastSyncedAtRef.current = nextLastSyncedAt;
          setSyncSelectionState(nextSelection);
          setLastSyncedAt(nextLastSyncedAt);
          refreshLocalSummary(nextSelection);
          // Preference events are control-plane changes, not product writes.
          // Applying them must never create a cross-tab sync loop.
          return;
        }

        const recoveryKey =
          continuityRecoveryStorageKey(currentUserId);
        if (event.key === recoveryKey) {
          const parsed = parseContinuityRecovery(event.newValue);
          recoveryRef.current = parsed.ok ? parsed.recovery : null;
          setRecoveryAvailable(parsed.ok);
          return;
        }
      }

      const category = event.key
        ? RELEVANT_STORAGE_KEYS.get(event.key) ?? null
        : null;
      if (category) noteChange(category, "local");
    };
    const onFocus = () => scheduleAutomaticSync();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleAutomaticSync();
      }
    };

    window.addEventListener(
      CONTINUITY_LOCAL_CHANGE_EVENT,
      onLocalChange,
    );
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener(
        CONTINUITY_LOCAL_CHANGE_EVENT,
        onLocalChange,
      );
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      if (automaticTimerRef.current !== null) {
        window.clearTimeout(automaticTimerRef.current);
        automaticTimerRef.current = null;
      }
    };
  }, [
    configured,
    refreshLocalSummary,
    scheduleAutomaticSync,
  ]);

  const setSyncSelection = useCallback(
    (selection: SyncSelection) => {
      if (!isSyncSelection(selection)) return;
      const normalized = cloneSelection(selection);
      const changed = !continuitySyncSelectionsEqual(
        normalized,
        selectionRef.current,
      );
      if (changed) {
        authGenerationRef.current += 1;
        localChangedDuringSyncRef.current = true;
        if (
          automaticTimerRef.current !== null &&
          typeof window !== "undefined"
        ) {
          window.clearTimeout(automaticTimerRef.current);
          automaticTimerRef.current = null;
        }
      }
      selectionRef.current = normalized;
      setSyncSelectionState(normalized);
      const activeSession = sessionRef.current;
      if (activeSession) {
        persistPreference(
          activeSession.user.id,
          consentRef.current,
          normalized,
          lastSyncedAtRef.current,
        );
      }
      refreshLocalSummary(normalized);
      if (changed && consentRef.current) {
        if (syncInFlightRef.current) {
          queuedAutomaticSyncRef.current = true;
        } else {
          scheduleAutomaticSync();
        }
      }
    },
    [
      persistPreference,
      refreshLocalSummary,
      scheduleAutomaticSync,
    ],
  );

  const signUp = useCallback(
    async (input: ContinuityEmailPasswordInput) => {
      const result = await adapter.signUp(input);
      if (result.ok && result.data.session) {
        applySession(result.data.session);
      }
      return result;
    },
    [adapter, applySession],
  );

  const signIn = useCallback(
    async (input: ContinuityEmailPasswordInput) => {
      // Authentication is intentionally separate from firstSync. Never add a
      // sync call to this action: local data needs a second explicit choice.
      const result = await adapter.signIn(input);
      if (result.ok && result.data.session) {
        applySession(result.data.session);
      }
      return result;
    },
    [adapter, applySession],
  );

  const signOut = useCallback(async () => {
    const result = await adapter.signOut();
    if (result.ok) applySession(null);
    return result;
  }, [adapter, applySession]);

  const updatePassword = useCallback(
    async (input: ContinuityPasswordInput) => {
      const result = await adapter.updatePassword(input);
      if (result.ok) setRecoveryMode("none");
      return result;
    },
    [adapter],
  );

  const deleteAccount = useCallback(async () => {
    const deletedUserId = sessionRef.current?.user.id ?? null;
    if (!deletedUserId) {
      return {
        ok: false,
        error: {
          code: "not_authenticated",
          message: "Sign in to continue.",
          retryable: false,
        },
      } satisfies ContinuityResult<void>;
    }
    // Product data remains local unless the user separately chooses to clear
    // it. Per-account consent and recovery are removed because they are no
    // longer usable and recovery can contain private notes or contacts.
    const result = await adapter.deleteAccount(deletedUserId);
    if (result.ok) {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(
            continuityPreferenceStorageKey(deletedUserId),
          );
        } catch {
          // Try recovery cleanup independently even when this key fails.
        }
        try {
          window.localStorage.removeItem(
            continuityRecoveryStorageKey(deletedUserId),
          );
        } catch {
          // Account deletion succeeded; product-local state remains intact.
        }
      }
      if (sessionRef.current?.user.id === deletedUserId) {
        recoveryRef.current = null;
        setRecoveryAvailable(false);
        applySession(null);
      }
    }
    return result;
  }, [adapter, applySession]);

  const restoreRecovery = useCallback(async (): Promise<ContinuityRuntimeResult> => {
    const activeSession = sessionRef.current;
    if (!configured || !activeSession || typeof window === "undefined") {
      return runtimeFailure("Sign in to restore sync recovery data.");
    }

    let recovery = recoveryRef.current;
    if (!recovery) {
      try {
        const parsed = parseContinuityRecovery(
          window.localStorage.getItem(
            continuityRecoveryStorageKey(activeSession.user.id),
          ),
        );
        recovery = parsed.ok ? parsed.recovery : null;
      } catch {
        recovery = null;
      }
    }
    if (!recovery) {
      return runtimeFailure("No valid continuity recovery data is available.");
    }

    authGenerationRef.current += 1;
    localChangedDuringSyncRef.current = true;
    queuedAutomaticSyncRef.current = false;
    if (automaticTimerRef.current !== null) {
      window.clearTimeout(automaticTimerRef.current);
      automaticTimerRef.current = null;
    }
    const transaction = createTransactionalStorage(window.localStorage);
    const restored = commitContinuitySnapshotToStorage(
      transaction.writer,
      recovery.localBefore,
      recovery.selection,
    );
    if (!restored.ok) {
      transaction.rollback();
      return runtimeFailure(
        restored.error ?? "Recovery could not be restored.",
      );
    }

    consentRef.current = false;
    selectionRef.current = cloneSelection(recovery.selection);
    lastSyncedAtRef.current = null;
    setSyncSelectionState(cloneSelection(recovery.selection));
    setLastSyncedAt(null);
    setSyncStatus("idle");
    setSyncError(null);
    persistPreference(
      activeSession.user.id,
      false,
      recovery.selection,
      null,
    );
    try {
      window.localStorage.removeItem(
        continuityRecoveryStorageKey(activeSession.user.id),
      );
    } catch {
      // The restored local product data remains usable.
    }
    recoveryRef.current = null;
    setRecoveryAvailable(false);
    refreshLocalSummary(recovery.selection);
    for (const category of changedCategories(transaction.changedKeys)) {
      dispatchContinuityLocalChange(category, "sync");
    }
    return { ok: true };
  }, [configured, persistPreference, refreshLocalSummary]);

  const value = useMemo<ContinuityContextValue>(
    () => ({
      configured,
      status,
      session,
      recoveryMode,
      capabilities: adapter.capabilities,
      signUp,
      signIn,
      signOut,
      resendSignUpVerification: (input) =>
        adapter.resendSignUpVerification(input),
      sendPasswordReset: (input) => adapter.sendPasswordReset(input),
      updatePassword,
      localSummary,
      syncSelection,
      setSyncSelection,
      firstSync: () => performSync("explicit"),
      manualSync: () => performSync("explicit"),
      syncStatus,
      syncError,
      lastSyncedAt,
      recoveryAvailable,
      restoreRecovery,
      deleteAccount,
    }),
    [
      adapter,
      configured,
      deleteAccount,
      lastSyncedAt,
      localSummary,
      performSync,
      recoveryAvailable,
      recoveryMode,
      restoreRecovery,
      session,
      setSyncSelection,
      signIn,
      signOut,
      signUp,
      status,
      syncError,
      syncSelection,
      syncStatus,
      updatePassword,
    ],
  );

  return (
    <ContinuityContext.Provider value={value}>
      {children}
    </ContinuityContext.Provider>
  );
}

export function useContinuity(): ContinuityContextValue {
  const value = useContext(ContinuityContext);
  if (!value) {
    throw new Error("useContinuity must be used within ContinuityProvider.");
  }
  return value;
}
