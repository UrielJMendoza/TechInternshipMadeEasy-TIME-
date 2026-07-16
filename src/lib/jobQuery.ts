import { z } from "zod";
import { supabase } from "./supabase";
import type { Tables } from "./database.types";
import type {
  Category,
  CompensationCadence,
  Internship,
  JobListingChange,
  LocationType,
  RoleType,
} from "./types";
import {
  isInternshipTermKey,
  sortTermKeys,
  type InternshipTermKey,
} from "./jobTerms";

const categoryValues = [
  "software", "cloud", "data-ml", "quant", "security", "hardware",
  "mechanical", "electrical", "civil", "aerospace", "manufacturing",
  "industrial", "materials", "finance", "consulting", "accounting",
  "operations", "product", "marketing", "supply-chain", "other",
] as const satisfies readonly Category[];

const roleValues = ["internship", "new_grad"] as const satisfies readonly RoleType[];
const sortValues = [
  "featured", "newest", "company", "salary", "location", "application-stage",
] as const;
const termKeySchema = z.custom<InternshipTermKey>(
  (value) => typeof value === "string" && isInternshipTermKey(value),
  "invalid internship term",
);

export const JobQuerySchema = z.object({
  roleType: z.enum(roleValues).default("internship"),
  query: z.string().trim().max(100).default(""),
  majorId: z.string().regex(/^[a-z0-9-]{1,64}$/).default("all"),
  nicheId: z.string().regex(/^[a-z0-9-]{1,64}$/).default("all"),
  locationIds: z.array(z.string().regex(/^[a-z0-9:-]{1,80}$/)).max(25).default([]),
  termKeys: z
    .array(termKeySchema)
    .max(20)
    .default([]),
  remoteOnly: z.boolean().default(false),
  visaSponsorship: z.boolean().default(false),
  freshness: z.enum(["all", "hot", "new"]).default("all"),
  trackingKeys: z.array(z.string().uuid()).max(500).nullable().default(null),
  sort: z.enum(sortValues).default("newest"),
  cursor: z.string().max(2048).nullable().default(null),
  pageSize: z.number().int().min(30).max(60).default(30),
});

export type JobQuery = z.infer<typeof JobQuerySchema>;

const CursorSchema = z.object({
  v: z.literal(1),
  fingerprint: z.string().length(8),
  sort: z.enum(sortValues),
  sortValue: z.string(),
  firstSeenAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
  seen: z.number().int().nonnegative(),
});

type Cursor = z.infer<typeof CursorSchema>;

export interface FacetCount {
  id: string;
  count: number;
}

export interface JobFacets {
  locations: FacetCount[];
  categories: FacetCount[];
  sources: FacetCount[];
  terms: FacetCount[];
}

export interface JobPage {
  items: Internship[];
  total: number;
  facets: JobFacets;
  nextCursor: string | null;
  hasMore: boolean;
  updatedAt: string | null;
  roleTotals: Record<RoleType, number>;
}

function fingerprint(input: JobQuery): string {
  const stable = JSON.stringify({
    roleType: input.roleType,
    query: input.query,
    majorId: input.majorId,
    nicheId: input.nicheId,
    locationIds: [...input.locationIds].sort(),
    termKeys: [...input.termKeys].sort(),
    remoteOnly: input.remoteOnly,
    visaSponsorship: input.visaSponsorship,
    freshness: input.freshness,
    trackingKeys: input.trackingKeys ? [...input.trackingKeys].sort() : null,
    sort: input.sort,
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < stable.length; index += 1) {
    hash ^= stable.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string | null, input: JobQuery): Cursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const cursor = CursorSchema.parse(parsed);
    if (cursor.fingerprint !== fingerprint(input) || cursor.sort !== input.sort) {
      throw new Error("Cursor does not match the active filters");
    }
    return cursor;
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message.includes("active filters")
        ? error.message
        : "Invalid pagination cursor",
    );
  }
}

function isCategory(value: string): value is Category {
  return (categoryValues as readonly string[]).includes(value);
}

function roleType(value: string): RoleType {
  return value === "new_grad" ? "new_grad" : "internship";
}

function locationType(value: string): LocationType {
  return value === "remote" || value === "hybrid" ? value : "onsite";
}

function cadence(value: string | null): CompensationCadence | null {
  return value === "hourly" || value === "monthly" || value === "annual"
    ? value
    : null;
}

function mapJob(
  row: Tables<"jobs">,
  contributingSources: readonly string[],
  observationTerms: readonly InternshipTermKey[],
  listingChanges: readonly JobListingChange[],
): Internship {
  return {
    id: row.id,
    tracking_key: row.tracking_key,
    title: row.title,
    company: row.company,
    location: row.display_location,
    category: isCategory(row.category) ? row.category : "other",
    role_type: roleType(row.role_type),
    season: row.season,
    term_keys: sortTermKeys([
      ...row.term_keys.filter(isInternshipTermKey),
      ...observationTerms,
    ]),
    salary: row.salary_raw,
    link: row.primary_apply_url,
    source: row.primary_source,
    sponsorship: row.sponsorship,
    posted_date: row.posted_date,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    last_checked_at: row.last_checked_at,
    is_active: row.is_active,
    company_domain:
      (row.company_domain_confidence ?? 0) >= 0.8 ? row.company_domain : null,
    country_code: row.country_code,
    region_code: row.region_code,
    city: row.city,
    metro_id: row.metro_id,
    location_type: locationType(row.location_type),
    normalization_confidence: row.normalization_confidence,
    contributing_sources:
      contributingSources.length > 0
        ? [...contributingSources]
        : [row.primary_source],
    salary_currency: row.salary_currency,
    salary_minimum: row.salary_minimum,
    salary_maximum: row.salary_maximum,
    salary_cadence: cadence(row.salary_cadence),
    annualized_salary_minimum: row.annualized_salary_minimum,
    annualized_salary_maximum: row.annualized_salary_maximum,
    salary_parse_confidence: row.salary_parse_confidence,
    salary_provenance:
      row.salary_provenance === "source-listed" ? "source-listed" : null,
    listing_changes: [...listingChanges],
  };
}

function cursorSortValue(row: Tables<"jobs">, sort: JobQuery["sort"]): string {
  if (sort === "featured") {
    return row.category === "software" || row.category === "cloud" ? "0" : "1";
  }
  if (sort === "company") return row.company.toLocaleLowerCase("en-US");
  if (sort === "location") return row.display_location.toLocaleLowerCase("en-US");
  if (sort === "salary") return String(row.source_salary_sort_max ?? -1);
  if (sort === "newest") return row.sort_date;
  return "";
}

async function fetchFacets(role: RoleType): Promise<JobFacets> {
  const db = supabase();
  const [locations, categories, sources, terms] = await Promise.all([
    db.from("job_location_facets").select("id,job_count").eq("role_type", role),
    db.from("job_category_facets").select("id,job_count").eq("role_type", role),
    db.from("job_source_facets").select("id,job_count").eq("role_type", role),
    db.from("job_term_facets").select("id,job_count").eq("role_type", role),
  ]);
  const error = locations.error ?? categories.error ?? sources.error ?? terms.error;
  if (error) throw new Error(`Unable to load job facets: ${error.message}`);

  const normalize = (
    rows: Array<{ id: string | null; job_count: number | null }> | null,
  ): FacetCount[] =>
    (rows ?? [])
      .filter((row): row is { id: string; job_count: number | null } => Boolean(row.id))
      .map((row) => ({ id: row.id, count: Number(row.job_count ?? 0) }))
      .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id));

  return {
    locations: normalize(locations.data),
    categories: normalize(categories.data),
    sources: normalize(sources.data),
    terms: normalize(terms.data),
  };
}

export async function queryJobs(rawInput: unknown): Promise<JobPage> {
  const input = JobQuerySchema.parse(rawInput);
  const cursor = decodeCursor(input.cursor, input);
  const db = supabase();
  const filterArgs = {
    p_role_type: input.roleType,
    p_query: input.query || undefined,
    p_major_id: input.majorId,
    p_niche_id: input.nicheId,
    p_location_ids: input.locationIds,
    p_term_keys: input.termKeys,
    p_remote_only: input.remoteOnly,
    p_visa_sponsorship: input.visaSponsorship,
    p_freshness: input.freshness,
    p_tracking_keys: input.trackingKeys ?? undefined,
  };
  const [searchResult, countResult] = await Promise.all([
    db.rpc("search_jobs", {
      ...filterArgs,
      p_sort_key: input.sort,
      p_cursor_sort: cursor?.sortValue,
      p_cursor_time: cursor?.firstSeenAt,
      p_cursor_id: cursor?.id,
      p_page_size: input.pageSize,
    }),
    db.rpc("count_jobs", filterArgs),
  ]);
  if (searchResult.error) {
    throw new Error(`Unable to load jobs: ${searchResult.error.message}`);
  }
  if (countResult.error) {
    throw new Error(`Unable to count jobs: ${countResult.error.message}`);
  }

  const rows = searchResult.data ?? [];
  const ids = rows.map((row) => row.id);
  const [sourceRows, changeRows] = ids.length
    ? await Promise.all([
        db
          .from("job_sources")
          .select("job_id,source,term_keys")
          .in("job_id", ids)
          .eq("active", true),
        db
          .from("job_changes")
          .select("job_id,changed_fields,created_at")
          .in("job_id", ids)
          .order("created_at", { ascending: false })
          .limit(Math.min(ids.length * 10, 1000)),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (sourceRows.error) {
    throw new Error(`Unable to load contributing sources: ${sourceRows.error.message}`);
  }
  if (changeRows.error) {
    throw new Error(`Unable to load listing changes: ${changeRows.error.message}`);
  }

  const sourcesByJob = new Map<string, string[]>();
  const termsByJob = new Map<string, InternshipTermKey[]>();
  for (const observation of sourceRows.data ?? []) {
    const values = sourcesByJob.get(observation.job_id) ?? [];
    if (!values.includes(observation.source)) values.push(observation.source);
    sourcesByJob.set(observation.job_id, values);
    const terms = termsByJob.get(observation.job_id) ?? [];
    for (const term of observation.term_keys) {
      if (isInternshipTermKey(term) && !terms.includes(term)) terms.push(term);
    }
    termsByJob.set(observation.job_id, sortTermKeys(terms));
  }

  const changesByJob = new Map<string, JobListingChange[]>();
  for (const change of changeRows.data ?? []) {
    const values = changesByJob.get(change.job_id) ?? [];
    if (values.length < 3) {
      values.push({
        changed_fields: change.changed_fields,
        created_at: change.created_at,
      });
      changesByJob.set(change.job_id, values);
    }
  }

  const items = rows.map((row) => mapJob(
    row,
    sourcesByJob.get(row.id) ?? [],
    termsByJob.get(row.id) ?? [],
    changesByJob.get(row.id) ?? [],
  ));
  const last = rows.at(-1);
  const total = Number(countResult.data ?? 0);
  const seen = (cursor?.seen ?? 0) + items.length;
  const hasMore = seen < total;
  const nextCursor = last && hasMore
    ? encodeCursor({
        v: 1,
        fingerprint: fingerprint(input),
        sort: input.sort,
        sortValue: cursorSortValue(last, input.sort),
        firstSeenAt: last.first_seen_at,
        id: last.id,
        seen,
      })
    : null;

  const [facets, updated, internshipTotal, newGradTotal] = await Promise.all([
    fetchFacets(input.roleType),
    db.from("jobs").select("last_seen_at").order("last_seen_at", { ascending: false }).limit(1),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("role_type", "internship"),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("role_type", "new_grad"),
  ]);
  if (updated.error) throw new Error(`Unable to load update timestamp: ${updated.error.message}`);
  if (internshipTotal.error || newGradTotal.error) {
    throw new Error("Unable to load role totals");
  }

  return {
    items,
    total,
    facets,
    nextCursor,
    hasMore,
    updatedAt: updated.data?.[0]?.last_seen_at ?? null,
    roleTotals: {
      internship: internshipTotal.count ?? 0,
      new_grad: newGradTotal.count ?? 0,
    },
  };
}
