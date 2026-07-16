import type { InternshipTermKey } from "./jobTerms";

export type RoleType = "internship" | "new_grad";

export type SourceId =
  | "simplify"
  | "zshah101"
  | "zapplyjobs"
  | "northwesternfintech"
  | "speedyapply"
  | "vanshb03";

export type LocationType = "remote" | "hybrid" | "onsite";
export type NormalizationConfidence = "high" | "medium" | "low";

export interface StructuredLocation {
  raw_location: string;
  country_code: string | null;
  region_code: string | null;
  city: string | null;
  metro_id: string | null;
  location_type: LocationType;
  normalization_confidence: NormalizationConfidence;
  eligible: boolean;
  evidence: string[];
  quarantine_reason:
    | "blank"
    | "explicit_foreign"
    | "ambiguous_remote"
    | "ambiguous_physical"
    | "worldwide"
    | null;
}

export type CompensationCadence = "hourly" | "monthly" | "annual";

export interface SourceCompensation {
  currency: string;
  minimum: number;
  maximum: number;
  cadence: CompensationCadence;
  annualized_minimum: number;
  annualized_maximum: number;
  raw_text: string;
  parse_confidence: NormalizationConfidence;
  provenance: "source-listed";
}

export interface JobSourceObservation {
  source: SourceId | string;
  external_id: string | null;
  raw_title: string;
  raw_location: string;
  source_url: string;
  apply_url: string;
  season: string | null;
  term_keys: InternshipTermKey[];
  requisition_id: string | null;
  posted_date: string | null;
  locations: StructuredLocation[];
  compensation: SourceCompensation | null;
}

export interface JobListingChange {
  changed_fields: string[];
  created_at: string;
}

export type Category =
  | "software"
  | "cloud"
  | "data-ml"
  | "quant"
  | "security"
  | "hardware"
  | "mechanical"
  | "electrical"
  | "civil"
  | "aerospace"
  | "manufacturing"
  | "industrial"
  | "materials"
  | "finance"
  | "consulting"
  | "accounting"
  | "operations"
  | "product"
  | "marketing"
  | "supply-chain"
  | "other";

export interface NormalizedJob {
  title: string;
  company: string;
  location: string;
  category: Category;
  role_type: RoleType;
  season: string | null;
  term_keys?: InternshipTermKey[];
  salary: string | null;
  link: string;
  source: string;
  sponsorship: string | null;
  posted_date: string | null; // ISO yyyy-mm-dd
  dedupe_key: string;
  raw_title?: string;
  raw_location?: string;
  source_url?: string;
  source_us_only?: boolean;
  external_id?: string | null;
  requisition_id?: string | null;
  requisition_ids?: string[];
  seasons?: string[];
  locations?: StructuredLocation[];
  compensation?: SourceCompensation | null;
  contributing_sources?: Array<SourceId | string>;
  observations?: JobSourceObservation[];
}

export interface Internship {
  id: string;
  tracking_key: string;
  title: string;
  company: string;
  location: string;
  category: Category;
  role_type: RoleType;
  season: string | null;
  term_keys: InternshipTermKey[];
  salary: string | null;
  link: string;
  source: string;
  sponsorship: string | null;
  posted_date: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_checked_at: string;
  is_active: boolean;
  company_domain: string | null;
  country_code: string | null;
  region_code: string | null;
  city: string | null;
  metro_id: string | null;
  location_type: LocationType;
  normalization_confidence: number;
  contributing_sources: string[];
  salary_currency: string | null;
  salary_minimum: number | null;
  salary_maximum: number | null;
  salary_cadence: CompensationCadence | null;
  annualized_salary_minimum: number | null;
  annualized_salary_maximum: number | null;
  salary_parse_confidence: number | null;
  salary_provenance: "source-listed" | null;
  listing_changes: JobListingChange[];
}

export const CATEGORY_LABELS: Record<Category, string> = {
  software: "Software",
  cloud: "Cloud / Infra",
  "data-ml": "Data / ML",
  quant: "Quant",
  security: "Security",
  hardware: "Hardware",
  mechanical: "Mechanical",
  electrical: "Electrical",
  civil: "Civil",
  aerospace: "Aerospace",
  manufacturing: "Manufacturing",
  industrial: "Industrial",
  materials: "Materials",
  finance: "Finance",
  consulting: "Consulting",
  accounting: "Accounting",
  operations: "Operations",
  product: "Product",
  marketing: "Marketing",
  "supply-chain": "Supply Chain",
  other: "Other",
};

// Kept as a compatibility export for existing UI consumers. The source
// registry is the single source of truth; this map is derived from it.
export { SOURCE_LABELS } from "./ingest/sourceRegistry.ts";
