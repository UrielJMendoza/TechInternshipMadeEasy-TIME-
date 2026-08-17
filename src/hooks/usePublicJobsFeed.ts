"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicJobsFeedSnapshot } from "@/lib/publicJobsFeed";
import {
  beginPublicJobsFeedActivation,
  isCurrentPublicJobsFeedActivation,
  loadPublicJobsFeed,
  type PublicJobsFeedActivationState,
} from "@/lib/publicJobsFeedClient";

type FeedState = PublicJobsFeedActivationState;

export interface PublicJobsFeedResult {
  data: PublicJobsFeedSnapshot | null;
  error: Error | null;
  isValidating: boolean;
  isLoading: boolean;
  refresh: () => Promise<PublicJobsFeedSnapshot | null>;
}

/**
 * Conditional public GET. The key is effectively null while disabled: no
 * request is made until browser-owned state proves the feed is useful.
 */
export function usePublicJobsFeed(enabled: boolean): PublicJobsFeedResult {
  const activationRef = useRef({ enabled: false, generation: 0 });
  const [state, setState] = useState<FeedState>(() =>
    beginPublicJobsFeedActivation(false, 0),
  );

  useEffect(() => {
    const activation = activationRef.current.generation + 1;
    activationRef.current = { enabled, generation: activation };
    // Clear the hook-local snapshot while disabled. Re-enabling can never
    // expose an expired result before the conditional request resolves.
    setState(beginPublicJobsFeedActivation(enabled, activation));
    if (!enabled) {
      return () => {
        if (activationRef.current.generation === activation) {
          activationRef.current = {
            enabled: false,
            generation: activation + 1,
          };
        }
      };
    }
    let active = true;

    void loadPublicJobsFeed().then(
      (entry) => {
        if (
          active &&
          isCurrentPublicJobsFeedActivation(activationRef.current, activation)
        ) {
          setState({
            activation,
            data: entry.data,
            error: null,
            isValidating: false,
          });
        }
      },
      (error: unknown) => {
        if (
          active &&
          isCurrentPublicJobsFeedActivation(activationRef.current, activation)
        ) {
          setState({
            activation,
            data: null,
            error:
              error instanceof Error
                ? error
                : new Error("Public jobs feed request failed"),
            isValidating: false,
          });
        }
      },
    );

    return () => {
      active = false;
      if (activationRef.current.generation === activation) {
        activationRef.current = {
          enabled: false,
          generation: activation + 1,
        };
      }
    };
  }, [enabled]);

  const refresh = useCallback(async () => {
    if (!enabled) return null;
    const refreshActivation = activationRef.current.generation;
    setState((current) =>
      current.activation === refreshActivation
        ? { ...current, error: null, isValidating: true }
        : current,
    );
    try {
      const entry = await loadPublicJobsFeed({ bypassMemoryCache: true });
      if (
        !isCurrentPublicJobsFeedActivation(
          activationRef.current,
          refreshActivation,
        )
      ) {
        return null;
      }
      setState({
        activation: refreshActivation,
        data: entry.data,
        error: null,
        isValidating: false,
      });
      return entry.data;
    } catch (error) {
      if (
        isCurrentPublicJobsFeedActivation(
          activationRef.current,
          refreshActivation,
        )
      ) {
        setState((current) => ({
          ...current,
          error:
            error instanceof Error
              ? error
              : new Error("Public jobs feed request failed"),
          isValidating: false,
        }));
      }
      return null;
    }
  }, [enabled]);

  const stateMatchesActivation =
    enabled && state.activation === activationRef.current.generation;
  const data = stateMatchesActivation ? state.data : null;
  const error = stateMatchesActivation ? state.error : null;
  return {
    data,
    error,
    isValidating: stateMatchesActivation && state.isValidating,
    isLoading: enabled && !data && !error,
    refresh,
  };
}
