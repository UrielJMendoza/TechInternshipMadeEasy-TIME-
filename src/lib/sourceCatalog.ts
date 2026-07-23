export type TimleySourceId =
  | "simplify"
  | "zshah101"
  | "zapplyjobs"
  | "northwesternfintech"
  | "speedyapply"
  | "vanshb03";

export interface SourceRepository {
  label: string;
  url: string;
}

export interface SourceCatalogEntry {
  id: TimleySourceId;
  label: string;
  repositoryUrl: string;
  repositories: readonly SourceRepository[];
  format: string;
  coverage: string;
}

/**
 * The public repositories read by the checked-in ingestion adapters, in
 * deduplication priority order. Earlier sources keep their display fields when
 * two rows resolve to the same application URL or normalized job identity.
 */
export const SOURCE_CATALOG = [
  {
    id: "simplify",
    label: "SimplifyJobs",
    repositoryUrl: "https://github.com/SimplifyJobs/Summer2026-Internships",
    repositories: [
      {
        label: "Summer2026-Internships",
        url: "https://github.com/SimplifyJobs/Summer2026-Internships",
      },
      {
        label: "New-Grad-Positions",
        url: "https://github.com/SimplifyJobs/New-Grad-Positions",
      },
    ],
    format: "JSON listing databases",
    coverage: "Internships and new-grad roles",
  },
  {
    id: "zshah101",
    label: "zshah101 / Automated List",
    repositoryUrl:
      "https://github.com/zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships",
    repositories: [
      {
        label:
          "Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships",
        url: "https://github.com/zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships",
      },
    ],
    format: "JSON feed",
    coverage: "Summer 2027 and Fall 2026 internships",
  },
  {
    id: "zapplyjobs",
    label: "zapplyjobs",
    repositoryUrl: "https://github.com/zapplyjobs/Internships-2027",
    repositories: [
      {
        label: "Internships-2027",
        url: "https://github.com/zapplyjobs/Internships-2027",
      },
    ],
    format: "Maintained README tables",
    coverage: "Internship and entry-level listings across several disciplines",
  },
  {
    id: "northwesternfintech",
    label: "Northwestern FinTech",
    repositoryUrl:
      "https://github.com/northwesternfintech/2027QuantInternships",
    repositories: [
      {
        label: "2027QuantInternships",
        url: "https://github.com/northwesternfintech/2027QuantInternships",
      },
    ],
    format: "Generated README tables",
    coverage: "Quant, software, hardware, and machine-learning internships",
  },
  {
    id: "speedyapply",
    label: "speedyapply",
    repositoryUrl:
      "https://github.com/speedyapply/2027-SWE-College-Jobs",
    repositories: [
      {
        label: "2027-SWE-College-Jobs",
        url: "https://github.com/speedyapply/2027-SWE-College-Jobs",
      },
    ],
    format: "README tables",
    coverage: "U.S. software internships and new-grad roles",
  },
  {
    id: "vanshb03",
    label: "vanshb03",
    repositoryUrl:
      "https://github.com/vanshb03/Summer2027-Internships",
    repositories: [
      {
        label: "Summer2027-Internships",
        url: "https://github.com/vanshb03/Summer2027-Internships",
      },
    ],
    format: "README table",
    coverage: "Summer 2027 internships",
  },
] as const satisfies readonly SourceCatalogEntry[];

export const SOURCE_CATALOG_BY_ID = Object.fromEntries(
  SOURCE_CATALOG.map((source) => [source.id, source]),
) as Record<TimleySourceId, (typeof SOURCE_CATALOG)[number]>;
