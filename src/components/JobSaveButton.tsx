"use client";

export function JobSaveButton({
  saved,
  onToggle,
  showLabel = false,
}: {
  saved: boolean;
  onToggle: () => void;
  showLabel?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={saved ? "Remove from saved" : "Save role"}
      aria-pressed={saved}
      title={saved ? "Remove from saved" : "Save role"}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      className={`ui-button pointer-events-auto ${
        showLabel
          ? "ui-button--secondary"
          : "ui-button--quiet ui-button--icon size-11 min-h-11 p-0 sm:size-9 sm:min-h-9"
      } ${saved ? "text-accent-hover" : "text-muted hover:text-fg"}`}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill={saved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
      {showLabel && (saved ? "Saved" : "Save role")}
    </button>
  );
}
