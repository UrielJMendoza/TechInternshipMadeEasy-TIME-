"use client";

import { useId } from "react";
import { FilterPopover } from "@/components/FilterPopover";
import { StageDot } from "@/components/ApplicationStageMenu";
import {
  APPLICATION_STAGE_LABELS,
  APPLICATION_STAGES,
  type ApplicationStage,
} from "@/lib/applicationTracking";
import type {
  LocationFacetOption,
  LocationFacetOrder,
  PhysicalLocationFacetId,
} from "@/lib/jobLocations";
import {
  UNKNOWN_TERM_KEY,
  termLabelFromKey,
  type InternshipTermKey,
  type TermFacetOption,
} from "@/lib/jobTerms";

export function QuickToggle({
  label,
  checked,
  onChange,
  description,
  count,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  count?: number;
}) {
  const descriptionId = useId();
  return (
    <span className="group/help relative inline-flex">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? descriptionId : undefined}
        onClick={() => onChange(!checked)}
        className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          checked
            ? "border-accent/45 bg-accent/10 text-accent"
            : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg"
        }`}
      >
        <span
          aria-hidden
          className={`relative h-4 w-7 rounded-full transition-colors motion-reduce:transition-none ${
            checked ? "bg-accent" : "bg-border-strong"
          }`}
        >
          <span
            className={`absolute top-0.5 size-3 rounded-full bg-white transition-transform motion-reduce:transition-none ${
              checked ? "translate-x-3.5" : "translate-x-0.5"
            }`}
          />
        </span>
        <span>{label}</span>
        {typeof count === "number" && (
          <span className="font-medium text-current/65">{count}</span>
        )}
      </button>
      {description && (
        <span
          id={descriptionId}
          role="tooltip"
          className="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-[95] hidden w-64 rounded-xl border border-border-strong bg-raised px-3 py-2 text-xs font-medium leading-relaxed text-fg shadow-[0_14px_38px_rgba(0,0,0,0.7)] group-hover/help:block group-focus-within/help:block lg:left-1/2 lg:right-auto lg:-translate-x-1/2"
        >
          {description}
        </span>
      )}
    </span>
  );
}

export function LocationFilterMenu({
  options,
  selected,
  order,
  disabled,
  onToggle,
  onOrderChange,
}: {
  options: LocationFacetOption[];
  selected: readonly PhysicalLocationFacetId[];
  order: LocationFacetOrder;
  disabled: boolean;
  onToggle: (id: PhysicalLocationFacetId) => void;
  onOrderChange: (order: LocationFacetOrder) => void;
}) {
  return (
    <FilterPopover
      label={disabled ? "Locations disabled" : "Locations"}
      activeCount={selected.length}
      disabled={disabled}
      title={disabled ? "Turn off Remote Only to choose physical locations" : undefined}
    >
      {() => (
        <>
          <div className="mb-2 flex rounded-xl bg-surface p-1" role="group" aria-label="Order locations">
            {(
              [
                ["popular", "Most jobs"],
                ["alphabetical", "A–Z"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={order === value}
                onClick={() => onOrderChange(value)}
                className={`min-h-8 flex-1 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  order === value ? "bg-raised text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="max-h-72 space-y-0.5 overflow-y-auto pr-1">
            {options.map((option) => {
              const checked = selected.includes(option.id);
              return (
                <label
                  key={option.id}
                  className={`flex min-h-10 items-center gap-2.5 rounded-xl px-2.5 text-sm ${
                    option.disabled
                      ? "cursor-not-allowed text-faint/65"
                      : "cursor-pointer text-muted hover:bg-white/[0.05] hover:text-fg"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={option.disabled}
                    onChange={() => onToggle(option.id)}
                    className="size-4 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  <span className="text-xs font-medium text-faint">{option.count}</span>
                </label>
              );
            })}
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => selected.forEach(onToggle)}
              className="mt-2 min-h-9 w-full rounded-xl text-xs font-semibold text-muted hover:bg-white/[0.05] hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              Clear locations
            </button>
          )}
        </>
      )}
    </FilterPopover>
  );
}

export function StageFilterMenu({
  selected,
  counts,
  onToggle,
}: {
  selected: readonly ApplicationStage[];
  counts: Record<ApplicationStage, number>;
  onToggle: (stage: ApplicationStage) => void;
}) {
  return (
    <FilterPopover label="Stages" activeCount={selected.length}>
      {() => (
        <>
          <p className="px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
            Application stage
          </p>
          <div className="space-y-0.5">
            {APPLICATION_STAGES.map((stage) => (
              <label
                key={stage}
                className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-sm text-muted hover:bg-white/[0.05] hover:text-fg"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(stage)}
                  onChange={() => onToggle(stage)}
                  className="size-4 accent-[var(--accent)]"
                />
                <StageDot stage={stage} />
                <span className="min-w-0 flex-1 truncate">
                  {APPLICATION_STAGE_LABELS[stage]}
                </span>
                <span className="text-xs font-medium text-faint">{counts[stage]}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => selected.forEach(onToggle)}
              className="mt-2 min-h-9 w-full rounded-xl text-xs font-semibold text-muted hover:bg-white/[0.05] hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              Clear stages
            </button>
          )}
        </>
      )}
    </FilterPopover>
  );
}

export function TermFilterMenu({
  options,
  selected,
  onToggle,
  onClear,
}: {
  options: readonly TermFacetOption[];
  selected: readonly InternshipTermKey[];
  onToggle: (term: InternshipTermKey) => void;
  onClear: () => void;
}) {
  return (
    <FilterPopover label="Term" activeCount={selected.length}>
      {() => (
        <>
          <p className="px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
            Internship term
          </p>
          <div className="max-h-72 space-y-0.5 overflow-y-auto pr-1">
            {options.map((option) => {
              const checked = selected.includes(option.id);
              const label = option.id === UNKNOWN_TERM_KEY
                ? "Term not listed"
                : option.label || termLabelFromKey(option.id);
              return (
                <label
                  key={option.id}
                  className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-sm text-muted hover:bg-white/[0.05] hover:text-fg"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(option.id)}
                    className="size-4 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <span className="text-xs font-medium text-faint">{option.count}</span>
                </label>
              );
            })}
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="mt-2 min-h-9 w-full rounded-xl text-xs font-semibold text-muted hover:bg-white/[0.05] hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              Clear terms
            </button>
          )}
        </>
      )}
    </FilterPopover>
  );
}

export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border bg-surface pl-2.5 pr-1 text-xs font-semibold text-muted">
      {label}
      <button
        type="button"
        aria-label={`Remove ${label} filter`}
        onClick={onRemove}
        className="flex size-7 items-center justify-center rounded-full text-faint hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </span>
  );
}
