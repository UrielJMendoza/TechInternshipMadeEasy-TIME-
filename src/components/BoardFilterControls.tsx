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
        className={`ui-button ui-button--sm min-h-10 ${
          checked
            ? "ui-selected"
            : "ui-button--secondary"
        }`}
      >
        <span
          aria-hidden
          data-checked={checked}
          className="ui-switch motion-reduce:transition-none"
        />
        <span>{label}</span>
        {typeof count === "number" && (
          <span key={count} className="motion-value-update font-medium text-current">
            {count}
          </span>
        )}
      </button>
      {description && (
        <span
          id={descriptionId}
          role="tooltip"
          className="ui-popover pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-[var(--layer-tooltip)] hidden w-64 px-3 py-2 text-xs font-medium leading-relaxed group-hover/help:block group-focus-within/help:block lg:left-1/2 lg:right-auto lg:-translate-x-1/2"
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
          <div className="ui-tabs mb-2 flex w-full" role="group" aria-label="Order locations">
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
                className="ui-tab min-h-8 flex-1 px-2 text-xs"
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
                  className={`flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors focus-within:bg-raised focus-within:text-fg ${
                    option.disabled
                      ? "cursor-not-allowed text-faint"
                      : "cursor-pointer text-muted hover:bg-raised hover:text-fg"
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
                  <span
                    key={option.count}
                    className="motion-value-update text-xs font-medium text-faint"
                  >
                    {option.count}
                  </span>
                </label>
              );
            })}
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => selected.forEach(onToggle)}
              className="ui-button ui-button--quiet ui-button--sm mt-2 w-full"
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
                className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted transition-colors hover:bg-raised hover:text-fg focus-within:bg-raised focus-within:text-fg"
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
                <span
                  key={counts[stage]}
                  className="motion-value-update text-xs font-medium text-faint"
                >
                  {counts[stage]}
                </span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => selected.forEach(onToggle)}
              className="ui-button ui-button--quiet ui-button--sm mt-2 w-full"
            >
              Clear stages
            </button>
          )}
        </>
      )}
    </FilterPopover>
  );
}

export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border bg-surface pl-2.5 pr-1 text-xs font-semibold text-muted shadow-[var(--shadow-control)]">
      {label}
      <button
        type="button"
        aria-label={`Remove ${label} filter`}
        onClick={onRemove}
        className="ui-button ui-button--quiet size-7 min-h-7 rounded-md p-0 text-faint"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </span>
  );
}
