"use client";

import { StageDot } from "@/components/ApplicationStageMenu";
import { FilterPopover } from "@/components/FilterPopover";
import { QuickToggle } from "@/components/BoardFilterControls";
import {
  APPLICATION_STAGE_LABELS,
  APPLICATION_STAGES,
  type ApplicationStage,
} from "@/lib/applicationTracking";
import type {
  BoardFilters,
  Collection,
  Freshness,
  MinimumSalary,
} from "@/lib/boardFilterState";
import { MINIMUM_SALARY_OPTIONS } from "@/lib/boardOptions";

export function AdvancedFilterPanel({
  filters,
  hotCount,
  newCount,
  savedCount,
  stageCounts,
  onUpdate,
  onToggleStage,
}: {
  filters: BoardFilters;
  hotCount: number;
  newCount: number;
  savedCount: number;
  stageCounts: Record<ApplicationStage, number>;
  onUpdate: (changes: Partial<BoardFilters>) => void;
  onToggleStage: (stage: ApplicationStage) => void;
}) {
  const activeCount =
    (filters.freshness !== "all" ? 1 : 0) +
    (filters.collection !== "all" ? 1 : 0) +
    (filters.visaSponsorship ? 1 : 0) +
    (filters.minimumSalary !== "any" ? 1 : 0) +
    filters.stages.length;

  return (
    <FilterPopover
      label="Advanced"
      activeCount={activeCount}
      className="shrink-0"
    >
      {() => (
        <div className="w-[min(30rem,calc(100vw-3rem))] p-1">
          <FilterGroup label="Freshness">
            <SegmentedFilter<Freshness>
              value={filters.freshness}
              options={[
                ["all", "All roles"],
                ["hot", `Hot · ${hotCount}`],
                ["new", `New · ${newCount}`],
              ]}
              onChange={(freshness) => onUpdate({ freshness })}
            />
          </FilterGroup>

          <FilterGroup label="Collection">
            <SegmentedFilter<Collection>
              value={filters.collection}
              options={[
                ["all", "All roles"],
                ["saved", `Saved · ${savedCount}`],
              ]}
              onChange={(collection) => onUpdate({ collection })}
            />
          </FilterGroup>

          <FilterGroup label="Eligibility evidence">
            <QuickToggle
              label="Visa Sponsorship"
              checked={filters.visaSponsorship}
              description="Only roles explicitly marked as offering sponsorship are included."
              onChange={(visaSponsorship) =>
                onUpdate({ visaSponsorship })
              }
            />
            <p className="mt-2 text-xs leading-relaxed text-faint">
              Unknown and restricted roles are excluded when this filter is on.
            </p>
          </FilterGroup>

          <FilterGroup label="Employer-listed pay">
            <label className="block">
              <span className="sr-only">Minimum employer-listed pay</span>
              <select
                value={filters.minimumSalary}
                onChange={(event) =>
                  onUpdate({
                    minimumSalary: event.target.value as MinimumSalary,
                  })
                }
                className="ui-control ui-input w-full"
              >
                {MINIMUM_SALARY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs leading-relaxed text-faint">
              Roles without employer-listed compensation are excluded when a
              minimum is selected.
            </p>
          </FilterGroup>

          <FilterGroup label="Application stage">
            <div className="grid gap-1 sm:grid-cols-2">
              {APPLICATION_STAGES.map((stage) => (
                <label
                  key={stage}
                  className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted transition-colors hover:bg-raised hover:text-fg focus-within:bg-raised focus-within:text-fg"
                >
                  <input
                    type="checkbox"
                    checked={filters.stages.includes(stage)}
                    onChange={() => onToggleStage(stage)}
                    className="size-4 accent-[var(--accent)]"
                  />
                  <StageDot stage={stage} />
                  <span className="min-w-0 flex-1 truncate">
                    {APPLICATION_STAGE_LABELS[stage]}
                  </span>
                  <span className="text-xs font-medium text-faint">
                    {stageCounts[stage]}
                  </span>
                </label>
              ))}
            </div>
          </FilterGroup>
        </div>
      )}
    </FilterPopover>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border px-1 py-3 last:border-b-0">
      <h3 className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-faint">
        {label}
      </h3>
      {children}
    </section>
  );
}

function SegmentedFilter<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="ui-tabs flex w-full" role="group">
      {options.map(([option, label]) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className="ui-tab min-w-0 flex-1 px-2 text-xs"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
