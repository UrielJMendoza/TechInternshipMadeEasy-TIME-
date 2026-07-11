"use client";

import { useCallback, useEffect, useState } from "react";

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
