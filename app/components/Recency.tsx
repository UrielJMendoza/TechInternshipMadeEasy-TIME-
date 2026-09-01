type RecencyKind = "posted" | "reported" | "found";

type RecencyProps = {
  kind: RecencyKind;
  label: string;
  timestamp?: string | null;
  precision?: "date" | "timestamp";
  recalculate?: boolean;
};

type RecencyTone = "newest" | "fresh" | "recent" | "aging" | "old";

function plural(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}

function relativeAge(timestamp: string): string | null {
  const then = Date.parse(timestamp);
  if (!Number.isFinite(then)) return null;

  const elapsedMs = Math.max(0, Date.now() - then);
  const minutes = Math.floor(elapsedMs / 60_000);
  const hours = Math.floor(elapsedMs / 3_600_000);
  const days = Math.floor(elapsedMs / 86_400_000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return plural(minutes, "minute");
  if (hours < 24) return plural(hours, "hour");
  if (days < 30) return plural(days, "day");
  if (days < 365) return plural(Math.floor(days / 30), "month");
  return plural(Math.floor(days / 365), "year");
}

function relativeCalendarAge(timestamp: string): string | null {
  const then = new Date(timestamp);
  if (!Number.isFinite(then.getTime())) return null;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const posted = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate());
  const days = Math.max(0, Math.floor((today - posted) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return plural(days, "day");
  if (days < 365) return plural(Math.floor(days / 30), "month");
  return plural(Math.floor(days / 365), "year");
}

function displayRecencyLabel(
  label: string,
  timestamp?: string | null,
  precision: "date" | "timestamp" = "timestamp",
  recalculate = false,
): string {
  const isLegacy = /^(?:Posted|Source reports|Found(?: by Timley)?)\s+/i.test(label);
  if ((recalculate || isLegacy) && timestamp) {
    const currentLabel = precision === "date"
      ? relativeCalendarAge(timestamp)
      : relativeAge(timestamp);
    if (currentLabel) return currentLabel;
  }

  if (!isLegacy) return label;

  const compact = label.replace(/^(?:Posted|Source reports|Found(?: by Timley)?)\s+/i, "");
  if (/^today$/i.test(compact)) return "Today";
  if (/^yesterday$/i.test(compact)) return "1 day ago";
  if (/^just now$/i.test(compact)) return "Just now";

  const shortAge = compact.match(/^(\d+)([mhd]) ago$/i);
  if (!shortAge) return compact;
  const value = Number(shortAge[1]);
  const unit = shortAge[2].toLowerCase() === "m"
    ? "minute"
    : shortAge[2].toLowerCase() === "h"
      ? "hour"
      : "day";
  return plural(value, unit);
}

function recencyTone(label: string): RecencyTone {
  const normalized = label.toLowerCase();
  if (normalized === "just now" || normalized === "today") return "newest";

  const age = normalized.match(/^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/);
  if (!age) return "old";

  const value = Number(age[1]);
  switch (age[2]) {
    case "minute":
      return "newest";
    case "hour":
      return "newest";
    case "day":
      if (value <= 2) return "fresh";
      if (value <= 6) return "recent";
      if (value <= 13) return "aging";
      return "old";
    case "week":
      return value === 1 ? "aging" : "old";
    default:
      return "old";
  }
}

export function Recency({
  kind,
  label,
  timestamp,
  precision = "timestamp",
  recalculate = false,
}: RecencyProps) {
  const displayLabel = displayRecencyLabel(label, timestamp, precision, recalculate);
  const semanticKind = kind === "posted"
    ? "Posted"
    : kind === "reported"
      ? "Source reports"
      : "Found by Timley";
  const visibleLabel = `${semanticKind} ${displayLabel.toLowerCase()}`;
  const dateTime = timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : undefined;

  return (
    <strong
      className={`recency recency-${recencyTone(displayLabel)}`}
      aria-label={visibleLabel}
    >
      <time dateTime={dateTime}>{visibleLabel}</time>
    </strong>
  );
}
