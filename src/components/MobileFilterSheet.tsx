"use client";

import { useMemo, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { QuickToggle } from "@/components/BoardFilterControls";
import { StageDot } from "@/components/ApplicationStageMenu";
import {
  APPLICATION_STAGE_LABELS,
  APPLICATION_STAGES,
  getApplicationStage,
  type ApplicationRecords,
  type ApplicationStage,
} from "@/lib/applicationTracking";
import {
  DEFAULT_BOARD_FILTERS,
  type BoardFilters,
  type Collection,
  type Freshness,
  type MajorId,
  type SortKey,
} from "@/lib/boardFilterState";
import { SORT_OPTIONS } from "@/lib/boardOptions";
import { MAJORS, MAJORS_BY_ID } from "@/lib/jobTaxonomy";
import type {
  LocationFacetOrder,
  PhysicalLocationFacetId,
} from "@/lib/jobLocations";
import {
  buildLocationFacetOptions,
  countRemoteJobs,
} from "@/lib/jobLocations";
import type { Internship, RoleType } from "@/lib/types";

export function MobileFilterSheet({
  open,
  onClose,
  filters,
  jobs,
  applications,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  filters: BoardFilters;
  jobs: Internship[];
  applications: ApplicationRecords;
  onApply: (filters: BoardFilters) => void;
}) {
  const [draft, setDraft] = useState(filters);

  const patch = (update: Partial<BoardFilters>) =>
    setDraft((current) => ({ ...current, ...update }));
  const activeMajor = MAJORS_BY_ID[draft.major];
  const draftJobs = useMemo(
    () => jobs.filter((job) => job.role_type === draft.tab),
    [draft.tab, jobs],
  );
  const locationOptions = useMemo(
    () => buildLocationFacetOptions(draftJobs, draft.locationOrder),
    [draft.locationOrder, draftJobs],
  );
  const remoteCount = useMemo(() => countRemoteJobs(draftJobs), [draftJobs]);
  const stageCounts = useMemo(
    () =>
      Object.fromEntries(
        APPLICATION_STAGES.map((stage) => [
          stage,
          draftJobs.filter(
            (job) => getApplicationStage(applications, job.link) === stage,
          ).length,
        ]),
      ) as Record<ApplicationStage, number>,
    [applications, draftJobs],
  );

  const toggleLocation = (id: PhysicalLocationFacetId) => {
    setDraft((current) => ({
      ...current,
      locationIds: current.locationIds.includes(id)
        ? current.locationIds.filter((selected) => selected !== id)
        : [...current.locationIds, id],
    }));
  };
  const toggleStage = (stage: ApplicationStage) => {
    setDraft((current) => ({
      ...current,
      stages: current.stages.includes(stage)
        ? current.stages.filter((selected) => selected !== stage)
        : [...current.stages, stage],
    }));
  };

  const cleared = { ...DEFAULT_BOARD_FILTERS, tab: draft.tab };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Filters and sorting"
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              onApply(cleared);
              onClose();
            }}
            className="flex-1 rounded-xl border border-border text-sm font-semibold text-muted hover:border-border-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className="flex-[1.4] rounded-xl bg-accent text-sm font-bold text-white hover:bg-[#2997ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Apply filters
          </button>
        </div>
      }
    >
      <div className="space-y-7">
        <FilterSection title="Role type">
          <SegmentedButtons<RoleType>
            value={draft.tab}
            options={[
              ["internship", "Internships"],
              ["new_grad", "New Grad"],
            ]}
            onChange={(tab) => patch({ tab })}
          />
        </FilterSection>

        <FilterSection title="Quick filters">
          <div className="flex flex-wrap gap-2">
            <QuickToggle
              label="Remote Only"
              checked={draft.remoteOnly}
              count={remoteCount}
              onChange={(remoteOnly) =>
                patch({ remoteOnly, locationIds: remoteOnly ? [] : draft.locationIds })
              }
            />
            <QuickToggle
              label="Visa Sponsorship"
              checked={draft.visaSponsorship}
              description="Only shows roles explicitly marked as offering visa sponsorship."
              onChange={(visaSponsorship) => patch({ visaSponsorship })}
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-faint">
            Visa Sponsorship only includes roles explicitly marked as offering
            sponsorship; unknown and restricted roles are excluded.
          </p>
        </FilterSection>

        <FilterSection title="Collection">
          <SegmentedButtons<Collection>
            value={draft.collection}
            options={[
              ["all", "All jobs"],
              ["saved", "Saved"],
            ]}
            onChange={(collection) => patch({ collection })}
          />
        </FilterSection>

        <FilterSection title="Freshness">
          <SegmentedButtons<Freshness>
            value={draft.freshness}
            options={[
              ["all", "All"],
              ["hot", "Hot"],
              ["new", "New"],
            ]}
            onChange={(freshness) => patch({ freshness })}
          />
        </FilterSection>

        <FilterSection title="Major and role">
          <div className="grid gap-2 sm:grid-cols-2">
            <SelectControl
              label="Major"
              value={draft.major}
              onChange={(value) =>
                patch({ major: value as MajorId, niche: "all" })
              }
              options={MAJORS.map((major) => [major.id, major.label])}
            />
            <SelectControl
              label="Specialization"
              value={draft.niche}
              onChange={(niche) => patch({ niche })}
              options={activeMajor.niches.map((niche) => [niche.id, niche.label])}
            />
          </div>
        </FilterSection>

        <FilterSection
          title="Locations"
          description={
            draft.remoteOnly
              ? "Physical locations are disabled while Remote Only is on."
              : "Select multiple markets; jobs can match any selected location."
          }
        >
          <SegmentedButtons<LocationFacetOrder>
            value={draft.locationOrder}
            options={[
              ["popular", "Most jobs"],
              ["alphabetical", "A–Z"],
            ]}
            onChange={(locationOrder) => patch({ locationOrder })}
          />
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {locationOptions.map((option) => (
              <label
                key={option.id}
                className={`flex min-h-11 items-center gap-2.5 rounded-xl border border-border px-3 text-sm ${
                  option.disabled || draft.remoteOnly
                    ? "cursor-not-allowed text-faint/60"
                    : "cursor-pointer text-muted hover:border-border-strong hover:text-fg"
                }`}
              >
                <input
                  type="checkbox"
                  checked={draft.locationIds.includes(option.id)}
                  disabled={option.disabled || draft.remoteOnly}
                  onChange={() => toggleLocation(option.id)}
                  className="size-4 accent-[var(--accent)]"
                />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <span className="text-xs text-faint">{option.count}</span>
              </label>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Application stages" description="Choose one or more stages.">
          <div className="grid gap-1 sm:grid-cols-2">
            {APPLICATION_STAGES.map((stage) => (
              <label
                key={stage}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-border px-3 text-sm text-muted hover:border-border-strong hover:text-fg"
              >
                <input
                  type="checkbox"
                  checked={draft.stages.includes(stage)}
                  onChange={() => toggleStage(stage)}
                  className="size-4 accent-[var(--accent)]"
                />
                <StageDot stage={stage} />
                <span className="min-w-0 flex-1 truncate">
                  {APPLICATION_STAGE_LABELS[stage]}
                </span>
                <span className="text-xs text-faint">{stageCounts[stage]}</span>
              </label>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Sort jobs">
          <SelectControl
            label="Sort order"
            value={draft.sort}
            onChange={(sort) => patch({ sort: sort as SortKey })}
            options={SORT_OPTIONS.map(([value, label]) => [value, label])}
          />
        </FilterSection>
      </div>
    </BottomSheet>
  );
}

function FilterSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-sm font-bold text-fg">{title}</h3>
      {description && <p className="mt-1 text-xs leading-relaxed text-faint">{description}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function SegmentedButtons<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex max-w-full flex-wrap rounded-xl border border-border bg-bg p-1" role="group">
      {options.map(([option, label]) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
            value === option ? "bg-raised text-fg" : "text-muted hover:text-fg"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SelectControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-semibold text-faint">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm font-medium text-muted focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {options.map(([option, optionLabel]) => (
          <option key={option} value={option}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
