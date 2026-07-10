export type RoleType = "internship" | "new_grad";

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
  salary: string | null;
  link: string;
  source: string;
  sponsorship: string | null;
  posted_date: string | null; // ISO yyyy-mm-dd
  dedupe_key: string;
}

export interface Internship {
  id: string;
  title: string;
  company: string;
  location: string;
  category: Category;
  role_type: RoleType;
  season: string | null;
  salary: string | null;
  link: string;
  source: string;
  sponsorship: string | null;
  posted_date: string | null;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
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

export const SOURCE_LABELS: Record<string, string> = {
  simplify: "SimplifyJobs",
  zshah101: "zshah101/Automated-List",
  vanshb03: "vanshb03/Summer2027-Internships",
  speedyapply: "speedyapply/2027-SWE-College-Jobs",
  zapplyjobs: "zapplyjobs/Internships-2027",
  northwesternfintech: "Northwestern Fintech / Quant",
};
