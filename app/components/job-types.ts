export type JobCardData = {
  id: string;
  company: string;
  title: string;
  location: string;
  freshnessLabel: string;
  freshnessKind: "posted" | "reported" | "found";
  roleLevel: "Internship" | "New grad";
  workplace: "Remote" | "Hybrid" | "On-site";
  compensation?: string;
  sponsorship?: "Confirmed" | "Not offered";
  logoText: string;
  logoTone: string;
  companyDomain?: string;
  applyUrl: string;
  sourceNames: string[];
  team?: string;
  summary?: string;
  titleIncomplete?: boolean;
  dateProvenance?: "employer-verified" | "source-reported";
  possibleRepost?: boolean;
  postedAt?: string | null;
  postedAtPrecision?: "date" | "timestamp";
  firstSeenAt?: string;
  lastSeenAt?: string;
  lastCheckedAt?: string;
};

export type JobFilters = {
  q: string;
  level: "all" | "internship" | "new-grad";
  major: "all" | "computer-science" | "engineering" | "business";
  niche: string;
  location: string;
  remote: boolean;
  sponsorship: boolean;
  source: string;
};
