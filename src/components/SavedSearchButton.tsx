"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { useSavedSearches } from "@/hooks/useSavedSearches";
import {
  MAX_SAVED_SEARCH_NAME_LENGTH,
  type SavedSearchChannels,
  type SavedSearchFrequency,
} from "@/lib/savedSearches";
import {
  publicBoardFilterCount,
  type BoardFilters,
} from "@/lib/boardFilterState";
import {
  trackAlertEnabled,
  trackSearchSaved,
} from "@/lib/analytics";

const FREQUENCY_OPTIONS = [
  ["instant", "Instant"],
  ["daily", "Daily"],
  ["weekly", "Weekly"],
  ["paused", "Paused"],
] as const satisfies ReadonlyArray<
  readonly [SavedSearchFrequency, string]
>;

const DEFAULT_CHANNELS: SavedSearchChannels = {
  inApp: true,
  browser: false,
  email: false,
};

export function SavedSearchButton({ filters }: { filters: BoardFilters }) {
  const { createSearch } = useSavedSearches();
  const [name, setName] = useState("");
  const [frequency, setFrequency] =
    useState<SavedSearchFrequency>("daily");
  const [channels, setChannels] =
    useState<SavedSearchChannels>(DEFAULT_CHANNELS);
  const [status, setStatus] = useState("");
  const titleId = useId();
  const privacyId = useId();

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = createSearch({
      name,
      filters,
      frequency,
      channels,
    });
    if (!created) {
      setStatus(
        "Search could not be saved. Check the name or remove an existing saved search.",
      );
      return;
    }
    trackSearchSaved({
      frequency,
      inApp: channels.inApp,
      browser: channels.browser,
      publicFilterCount: publicBoardFilterCount(filters),
    });
    if (frequency !== "paused" && channels.inApp) {
      trackAlertEnabled({ channel: "in-app", enabled: true });
    }
    if (frequency !== "paused" && channels.browser) {
      trackAlertEnabled({ channel: "browser", enabled: true });
    }
    setName("");
    setStatus("Search saved in this browser.");
  }

  function setChannel(
    channel: keyof SavedSearchChannels,
    enabled: boolean,
  ) {
    setChannels((current) => ({ ...current, [channel]: enabled }));
    setStatus("");
  }

  return (
    <details className="relative shrink-0">
      <summary className="ui-button ui-button--secondary ui-button--sm min-h-10 cursor-pointer list-none font-semibold">
        Save search
      </summary>

      <div
        role="group"
        aria-labelledby={titleId}
        className="ui-popover absolute right-0 top-[calc(100%+0.5rem)] z-[var(--layer-popover)] w-[min(22rem,calc(100vw-2rem))] p-4"
      >
        <h2 id={titleId} className="text-sm font-extrabold text-fg">
          Save this search
        </h2>
        <p
          id={privacyId}
          className="mt-1 text-xs leading-relaxed text-muted"
        >
          The name, filters, and alert choices start in this browser. Saving or
          signing in does not upload them; optional account continuity includes
          saved searches only after you explicitly select and sync that
          category.
        </p>

        <form
          onSubmit={submitSearch}
          aria-describedby={privacyId}
          className="mt-4"
        >
          <label className="block text-xs font-bold text-muted">
            Search name
            <input
              name="saved-search-name"
              type="text"
              value={name}
              required
              maxLength={MAX_SAVED_SEARCH_NAME_LENGTH}
              autoComplete="off"
              placeholder="e.g. Denver software internships"
              onChange={(event) => {
                setName(event.target.value);
                setStatus("");
              }}
              className="ui-control ui-input mt-1.5 w-full"
            />
          </label>

          <label className="mt-4 block text-xs font-bold text-muted">
            Alert frequency
            <select
              name="frequency"
              value={frequency}
              onChange={(event) => {
                setFrequency(
                  event.target.value as SavedSearchFrequency,
                );
                setStatus("");
              }}
              className="ui-control ui-input mt-1.5 w-full"
            >
              {FREQUENCY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="mt-4">
            <legend className="text-xs font-bold text-muted">
              Alert channels
            </legend>
            <div className="mt-2 space-y-1">
              <ChannelOption
                name="channel-in-app"
                label="In-app"
                checked={channels.inApp}
                onChange={(checked) => setChannel("inApp", checked)}
              />
              <ChannelOption
                name="channel-browser"
                label="Browser"
                checked={channels.browser}
                onChange={(checked) => setChannel("browser", checked)}
              />
              <ChannelOption
                name="channel-email"
                label="Email (unavailable)"
                checked={channels.email}
                disabled
                onChange={(checked) => setChannel("email", checked)}
              />
            </div>
          </fieldset>

          <p className="mt-3 text-[11px] leading-relaxed text-faint">
            Saving does not request notification permission. Browser notices
            require a separate opt-in from Alerts. Email delivery is not
            available.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="ui-button ui-button--primary ui-button--sm"
            >
              Save search
            </button>
            <Link
              href="/alerts"
              className="ui-button ui-button--quiet ui-button--sm"
            >
              Manage alerts
            </Link>
          </div>

          <p
            role="status"
            aria-live="polite"
            className="mt-3 min-h-4 text-xs font-semibold text-muted"
          >
            {status}
          </p>
        </form>
      </div>
    </details>
  );
}

function ChannelOption({
  name,
  label,
  checked,
  disabled = false,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-semibold ${
        disabled
          ? "cursor-not-allowed text-faint"
          : "cursor-pointer text-muted hover:bg-raised hover:text-fg"
      }`}
    >
      <input
        name={name}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[var(--accent)]"
      />
      <span>{label}</span>
    </label>
  );
}
