import type { Category, Internship } from "@/lib/types";
import type { MajorId } from "@/lib/boardFilterState";

export type JobMatcher = (job: Internship) => boolean;

export interface Niche {
  id: string;
  label: string;
  matches: JobMatcher;
}

export interface Major {
  id: MajorId;
  label: string;
  matches: JobMatcher;
  niches: Niche[];
}

const ALL_CATEGORIES: Category[] = [
  "software",
  "cloud",
  "data-ml",
  "quant",
  "security",
  "hardware",
  "mechanical",
  "electrical",
  "civil",
  "aerospace",
  "manufacturing",
  "industrial",
  "materials",
  "finance",
  "consulting",
  "accounting",
  "operations",
  "product",
  "marketing",
  "supply-chain",
  "other",
];
const ENGINEERING_CATEGORIES: Category[] = [
  "hardware",
  "mechanical",
  "electrical",
  "civil",
  "aerospace",
  "manufacturing",
  "industrial",
  "materials",
];
const BUSINESS_CATEGORIES: Category[] = [
  "finance",
  "consulting",
  "accounting",
  "operations",
  "product",
  "marketing",
  "supply-chain",
];

const matchesCategories =
  (categories: readonly Category[]): JobMatcher =>
  (job) =>
    categories.includes(job.category);

const matchesCategoryOrTitle =
  (categories: readonly Category[], pattern: RegExp): JobMatcher =>
  (job) =>
    categories.includes(job.category) || pattern.test(job.title);

const ENGINEERING_TITLE =
  /\b(mechanical|electrical|electronics?|civil|structural|aerospace|aeronautical|manufacturing|industrial|materials|robotics|chemical|biomedical|construction|quality engineering|systems engineering)\b/i;
const HARDWARE_TITLE = /\b(hardware|firmware|embedded|fpga|asic|silicon|semiconductor|chip)\b/i;
const ELECTRICAL_TITLE = /\b(electrical|electronics?|power systems?|controls?|embedded systems?)\b/i;
const MECHANICAL_TITLE = /\b(mechanical|mechanic|hvac|thermal|fluid systems?)\b/i;
const CIVIL_TITLE = /\b(civil|structural|geotechnical|construction|transportation engineering)\b/i;
const AEROSPACE_TITLE = /\b(aerospace|aeronautical|avionics|propulsion|flight systems?|spacecraft)\b/i;
const MANUFACTURING_TITLE = /\b(manufactur(ing|ability|e)|production engineer|quality engineer|process engineer)\b/i;
const INDUSTRIAL_TITLE = /\b(industrial|systems engineering|operations research)\b/i;
const MATERIALS_TITLE = /\b(materials?|metallurgy|polymer|electrochemistry)\b/i;
const SITE_RELIABILITY_TITLE = /\b(site reliability|sre)\b/i;
const BUSINESS_TITLE =
  /\b(product management|product manager|product marketing|product strategy|business|finance|financial|marketing|sales|operations?|supply chain|logistics|procurement|consulting|consultant|accounting|audit|investment banking|asset management|wealth management|private equity|venture capital)\b/i;
const PRODUCT_TITLE = /\b(product management|product manager|product marketing|product strategy|product operations?)\b/i;
const OPERATIONS_TITLE = /\b(operations?|process improvement|project management)\b/i;
const FINANCE_TITLE = /\b(finance|financial|investment banking|asset management|wealth management|private equity|venture capital|quant(itative)?|trading)\b/i;
const CONSULTING_TITLE = /\b(consulting|consultant|advisory|strategy intern)\b/i;
const ACCOUNTING_TITLE = /\b(accounting|accountant|audit(?:or|ing)?|tax)\b/i;
const MARKETING_TITLE = /\b(marketing|brand|growth|communications?|public relations?)\b/i;
const SUPPLY_CHAIN_TITLE = /\b(supply chain|logistics|procurement|sourcing|distribution)\b/i;

export const MAJORS: Major[] = [
  {
    id: "all",
    label: "All majors",
    matches: matchesCategories(ALL_CATEGORIES),
    niches: [{ id: "all", label: "All roles", matches: () => true }],
  },
  {
    id: "computer-science",
    label: "Computer Science",
    matches: matchesCategories(["software", "cloud", "data-ml", "quant", "security"]),
    niches: [
      { id: "all", label: "All CS roles", matches: () => true },
      { id: "software-engineering", label: "Software Engineering", matches: matchesCategories(["software"]) },
      { id: "cloud-infra", label: "Cloud / Infra", matches: matchesCategories(["cloud"]) },
      {
        id: "site-reliability",
        label: "Site Reliability",
        matches: (job) => job.category === "cloud" && SITE_RELIABILITY_TITLE.test(job.title),
      },
      { id: "security", label: "Security", matches: matchesCategories(["security"]) },
      { id: "data-ml", label: "Data / ML", matches: matchesCategories(["data-ml"]) },
      { id: "quant", label: "Quant", matches: matchesCategories(["quant"]) },
    ],
  },
  {
    id: "engineering",
    label: "Engineering",
    matches: matchesCategoryOrTitle(ENGINEERING_CATEGORIES, ENGINEERING_TITLE),
    niches: [
      { id: "all", label: "All engineering", matches: () => true },
      { id: "hardware-firmware", label: "Hardware / Firmware", matches: matchesCategoryOrTitle(["hardware"], HARDWARE_TITLE) },
      { id: "electrical", label: "Electrical", matches: matchesCategoryOrTitle(["electrical"], ELECTRICAL_TITLE) },
      { id: "mechanical", label: "Mechanical", matches: matchesCategoryOrTitle(["mechanical"], MECHANICAL_TITLE) },
      { id: "civil", label: "Civil", matches: matchesCategoryOrTitle(["civil"], CIVIL_TITLE) },
      { id: "aerospace", label: "Aerospace", matches: matchesCategoryOrTitle(["aerospace"], AEROSPACE_TITLE) },
      { id: "manufacturing", label: "Manufacturing", matches: matchesCategoryOrTitle(["manufacturing"], MANUFACTURING_TITLE) },
      { id: "industrial", label: "Industrial", matches: matchesCategoryOrTitle(["industrial"], INDUSTRIAL_TITLE) },
      { id: "materials", label: "Materials", matches: matchesCategoryOrTitle(["materials"], MATERIALS_TITLE) },
    ],
  },
  {
    id: "business",
    label: "Business",
    matches: matchesCategoryOrTitle([...BUSINESS_CATEGORIES, "quant"], BUSINESS_TITLE),
    niches: [
      { id: "all", label: "All business", matches: () => true },
      { id: "finance", label: "Finance", matches: matchesCategoryOrTitle(["finance", "quant"], FINANCE_TITLE) },
      { id: "consulting", label: "Consulting", matches: matchesCategoryOrTitle(["consulting"], CONSULTING_TITLE) },
      { id: "accounting", label: "Accounting", matches: matchesCategoryOrTitle(["accounting"], ACCOUNTING_TITLE) },
      { id: "operations", label: "Operations", matches: matchesCategoryOrTitle(["operations"], OPERATIONS_TITLE) },
      { id: "product", label: "Product", matches: matchesCategoryOrTitle(["product"], PRODUCT_TITLE) },
      { id: "marketing", label: "Marketing", matches: matchesCategoryOrTitle(["marketing"], MARKETING_TITLE) },
      { id: "supply-chain", label: "Supply Chain", matches: matchesCategoryOrTitle(["supply-chain"], SUPPLY_CHAIN_TITLE) },
    ],
  },
];

export const MAJORS_BY_ID = Object.fromEntries(
  MAJORS.map((major) => [major.id, major]),
) as Record<MajorId, Major>;
