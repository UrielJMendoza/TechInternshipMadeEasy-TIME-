import type { RoleType, SourceId } from "../types.ts";

export type SourceFormat = "json" | "markdown";

export interface SourceFeedDefinition {
  id: string;
  url: string;
  role_type: RoleType;
  format: SourceFormat;
  expected_content_types: readonly string[];
  max_response_bytes: number;
  proven_us_only: boolean;
  required_markers: readonly string[];
}

export interface SourceDefinition {
  id: SourceId;
  label: string;
  homepage: string;
  parser_version: string;
  feeds: readonly SourceFeedDefinition[];
}

const JSON_CONTENT_TYPES = ["application/json", "text/plain"] as const;
const MARKDOWN_CONTENT_TYPES = ["text/plain", "text/markdown"] as const;

export const SOURCE_REGISTRY = {
  simplify: {
    id: "simplify",
    label: "SimplifyJobs",
    homepage: "https://github.com/SimplifyJobs/Summer2026-Internships",
    parser_version: "simplify-v2",
    feeds: [
      {
        id: "internships",
        url: "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json",
        role_type: "internship",
        format: "json",
        expected_content_types: JSON_CONTENT_TYPES,
        max_response_bytes: 24 * 1024 * 1024,
        proven_us_only: false,
        required_markers: [],
      },
      {
        id: "new-grad",
        url: "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
        role_type: "new_grad",
        format: "json",
        expected_content_types: JSON_CONTENT_TYPES,
        max_response_bytes: 24 * 1024 * 1024,
        proven_us_only: false,
        required_markers: [],
      },
    ],
  },
  zshah101: {
    id: "zshah101",
    label: "zshah101/Automated-List",
    homepage:
      "https://github.com/zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships",
    parser_version: "zshah-v2",
    feeds: [
      {
        id: "jobs",
        url: "https://raw.githubusercontent.com/zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships/main/docs/api/jobs.json",
        role_type: "internship",
        format: "json",
        expected_content_types: JSON_CONTENT_TYPES,
        max_response_bytes: 8 * 1024 * 1024,
        proven_us_only: false,
        required_markers: [],
      },
    ],
  },
  zapplyjobs: {
    id: "zapplyjobs",
    label: "zapplyjobs/Internships-2027",
    homepage: "https://github.com/zapplyjobs/Internships-2027",
    parser_version: "zapply-v2",
    feeds: [
      {
        id: "readme",
        url: "https://raw.githubusercontent.com/zapplyjobs/Internships-2027/main/README.md",
        role_type: "internship",
        format: "markdown",
        expected_content_types: MARKDOWN_CONTENT_TYPES,
        max_response_bytes: 8 * 1024 * 1024,
        proven_us_only: false,
        required_markers: [
          "| Company | Role | Location | Posted | Visa | **Apply** |",
          "<summary><h3",
        ],
      },
    ],
  },
  northwesternfintech: {
    id: "northwesternfintech",
    label: "Northwestern Fintech / Quant",
    homepage: "https://github.com/northwesternfintech/2027QuantInternships",
    parser_version: "northwestern-quant-v2",
    feeds: [
      {
        id: "readme",
        url: "https://raw.githubusercontent.com/northwesternfintech/2027QuantInternships/main/README.md",
        role_type: "internship",
        format: "markdown",
        expected_content_types: MARKDOWN_CONTENT_TYPES,
        max_response_bytes: 4 * 1024 * 1024,
        proven_us_only: false,
        required_markers: ["**Locations**:", "|Role|Links|"],
      },
    ],
  },
  speedyapply: {
    id: "speedyapply",
    label: "speedyapply/2027-SWE-College-Jobs",
    homepage: "https://github.com/speedyapply/2027-SWE-College-Jobs",
    parser_version: "speedyapply-v2",
    feeds: [
      {
        id: "internships",
        url: "https://raw.githubusercontent.com/speedyapply/2027-SWE-College-Jobs/main/README.md",
        role_type: "internship",
        format: "markdown",
        expected_content_types: MARKDOWN_CONTENT_TYPES,
        max_response_bytes: 8 * 1024 * 1024,
        proven_us_only: true,
        required_markers: ["<!-- TABLE", "| Company"],
      },
      {
        id: "new-grad",
        url: "https://raw.githubusercontent.com/speedyapply/2027-SWE-College-Jobs/main/NEW_GRAD_USA.md",
        role_type: "new_grad",
        format: "markdown",
        expected_content_types: MARKDOWN_CONTENT_TYPES,
        max_response_bytes: 8 * 1024 * 1024,
        proven_us_only: true,
        required_markers: ["<!-- TABLE", "| Company"],
      },
    ],
  },
  vanshb03: {
    id: "vanshb03",
    label: "vanshb03/Summer2027-Internships",
    homepage: "https://github.com/vanshb03/Summer2027-Internships",
    parser_version: "vansh-v2",
    feeds: [
      {
        id: "readme",
        url: "https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/main/README.md",
        role_type: "internship",
        format: "markdown",
        expected_content_types: MARKDOWN_CONTENT_TYPES,
        max_response_bytes: 8 * 1024 * 1024,
        proven_us_only: false,
        required_markers: ["| Company", "| Role", "| Location"],
      },
    ],
  },
} as const satisfies Record<SourceId, SourceDefinition>;

export const SOURCE_IDS = Object.freeze(
  Object.keys(SOURCE_REGISTRY) as SourceId[],
);

export const SOURCE_LABELS = Object.freeze(
  Object.fromEntries(
    SOURCE_IDS.map((source) => [source, SOURCE_REGISTRY[source].label]),
  ) as Record<SourceId, string>,
);

export function sourceDefinition(source: SourceId): SourceDefinition {
  return SOURCE_REGISTRY[source];
}

export function sourceFeed(
  source: SourceId,
  feedId: string,
): SourceFeedDefinition {
  const feed = SOURCE_REGISTRY[source].feeds.find(
    (candidate) => candidate.id === feedId,
  );
  if (!feed) throw new Error(`Unknown feed ${source}/${feedId}`);
  return feed;
}
