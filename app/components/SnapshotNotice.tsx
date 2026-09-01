type SnapshotNoticeProps = {
  capturedAt?: string;
};

function capturedAtLabel(value: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

export function SnapshotNotice({ capturedAt }: SnapshotNoticeProps) {
  const label = capturedAt ? capturedAtLabel(capturedAt) : null;
  if (!label) return null;

  return (
    <aside className="snapshot-notice" aria-label="Job feed status">
      <strong>Feed status</strong>
      <p>
        Live updates are temporarily unavailable. Showing the last verified feed
        snapshot from {label}. Employer posting dates are kept exactly as supplied;
        discovery-only listings are labelled “Found by Timley.”
      </p>
    </aside>
  );
}
