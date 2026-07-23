"use client";

import { useState, useSyncExternalStore } from "react";
import { trackCollectionShared } from "@/lib/analytics";

const subscribeToShareAvailability = () => () => undefined;

function shareIsAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  );
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Copy unavailable");
}

export function ShareControls({
  path,
  title,
  kind,
  publicFilterCount = 0,
  compact = false,
}: {
  path: string;
  title: string;
  kind?: "filter" | "collection" | "company" | "campus";
  publicFilterCount?: number;
  compact?: boolean;
}) {
  const nativeShareAvailable = useSyncExternalStore(
    subscribeToShareAvailability,
    shareIsAvailable,
    () => false,
  );
  const [status, setStatus] = useState("");

  const url = () => new URL(path, window.location.origin).toString();

  const copy = async () => {
    try {
      await copyText(url());
      setStatus("Link copied.");
      if (kind) {
        trackCollectionShared({
          method: "copy",
          kind,
          publicFilterCount,
        });
      }
    } catch {
      setStatus("Copy failed. Select the address from your browser.");
    }
  };

  const share = async () => {
    if (typeof navigator.share !== "function") {
      setStatus("Sharing is unavailable. Copy the link instead.");
      return;
    }
    try {
      await navigator.share({ title, url: url() });
      setStatus("Shared.");
      if (kind) {
        trackCollectionShared({
          method: "native",
          kind,
          publicFilterCount,
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("Sharing is unavailable. Copy the link instead.");
    }
  };

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className={`ui-button ui-button--secondary ${compact ? "ui-button--sm" : ""}`}
      >
        Copy link
      </button>
      {nativeShareAvailable ? (
        <button
          type="button"
          onClick={share}
          className={`ui-button ui-button--quiet ${compact ? "ui-button--sm" : ""}`}
        >
          Share
        </button>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </div>
  );
}
