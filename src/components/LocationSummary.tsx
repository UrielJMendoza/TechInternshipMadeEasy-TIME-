import { getSafeUsLocationParts } from "@/lib/usLocations";

interface LocationSummaryProps {
  location: string | null | undefined;
  maxVisible?: number;
  fallback?: string;
  className?: string;
  jobLabel?: string;
}

export function LocationSummary({
  location,
  maxVisible = 2,
  fallback = "Location unavailable",
  className = "",
  jobLabel,
}: LocationSummaryProps) {
  const parts = getSafeUsLocationParts(location);
  const visibleCount = Math.max(1, maxVisible);

  if (parts.length === 0) {
    return <span className={`location-summary ${className}`}>{fallback}</span>;
  }

  const fullLocation = parts.join("; ");
  if (parts.length <= visibleCount) {
    return (
      <span className={`location-summary ${className}`} title={fullLocation}>
        {fullLocation}
      </span>
    );
  }

  const preview = parts.slice(0, visibleCount).join("; ");
  const remaining = parts.length - visibleCount;

  return (
    <details
      className={`location-summary location-summary--expandable ${className}`}
    >
      <summary>
        <span className="location-summary__preview">{preview}</span>
        <span className="location-summary__more">
          View {remaining} more {remaining === 1 ? "location" : "locations"}
        </span>
        <span className="location-summary__less">Show fewer locations</span>
        {jobLabel ? <span className="sr-only"> for {jobLabel}</span> : null}
      </summary>
      <ul className="location-summary__full">
        {parts.map((part) => (
          <li key={part}>{part}</li>
        ))}
      </ul>
    </details>
  );
}
