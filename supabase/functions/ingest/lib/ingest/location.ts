import type {
  LocationType,
  NormalizationConfidence,
  StructuredLocation,
} from "../types.ts";

export interface LocationNormalizationOptions {
  sourceUsOnly?: boolean;
}

export interface NormalizedLocationResult {
  raw_location: string;
  locations: StructuredLocation[];
  display: string;
  eligible: boolean;
  normalization_confidence: NormalizationConfidence;
  quarantined: boolean;
  quarantine_reasons: string[];
}

const STATE_CODES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};

const VALID_STATE_CODES = new Set(Object.values(STATE_CODES));

const COUNTRY_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["united kingdom", "GB"], ["uk", "GB"], ["canada", "CA"],
  ["israel", "IL"], ["south africa", "ZA"], ["costa rica", "CR"],
  ["netherlands", "NL"], ["north holland", "NL"], ["germany", "DE"],
  ["france", "FR"], ["india", "IN"], ["ireland", "IE"],
  ["spain", "ES"], ["singapore", "SG"], ["switzerland", "CH"],
  ["australia", "AU"], ["new zealand", "NZ"], ["mexico", "MX"],
  ["brazil", "BR"], ["argentina", "AR"], ["japan", "JP"],
  ["china", "CN"], ["hong kong", "HK"], ["taiwan", "TW"],
  ["south korea", "KR"], ["poland", "PL"], ["italy", "IT"],
  ["portugal", "PT"], ["sweden", "SE"], ["norway", "NO"],
  ["denmark", "DK"], ["finland", "FI"], ["belgium", "BE"],
  ["austria", "AT"], ["romania", "RO"], ["hungary", "HU"],
  ["united arab emirates", "AE"], ["uae", "AE"],
];

const TERRITORIES: Record<string, string> = {
  "puerto rico": "PR",
  guam: "GU",
  "us virgin islands": "VI",
  "u s virgin islands": "VI",
  "northern mariana islands": "MP",
  "american samoa": "AS",
};

const METROS: Record<string, string> = {
  "new york": "nyc", nyc: "nyc", manhattan: "nyc", brooklyn: "nyc",
  "san francisco": "sf-bay", sf: "sf-bay", oakland: "sf-bay",
  "san jose": "sf-bay", berkeley: "sf-bay", "mountain view": "sf-bay",
  "palo alto": "sf-bay", sunnyvale: "sf-bay", "santa clara": "sf-bay",
  chicago: "chicago", boston: "boston", cambridge: "boston",
  austin: "austin", seattle: "seattle", bellevue: "seattle",
  redmond: "seattle", denver: "denver", boulder: "denver",
  "washington dc": "washington-dc", washington: "washington-dc",
  "los angeles": "los-angeles", la: "los-angeles",
};

const KNOWN_REWRITES: Record<string, readonly string[]> = {
  "chicago puerto rico": ["Chicago, IL", "Puerto Rico"],
  "chicago nyc": ["Chicago, IL", "New York, NY"],
  "chicago austin": ["Chicago, IL", "Austin, TX"],
};

const WORLDWIDE_MARKER = /\b(?:worldwide|global|anywhere|international)\b/;
const REMOTE_MARKER = /\b(?:remote|work from home|wfh)\b/;
const HYBRID_MARKER = /\bhybrid\b/;
const US_MARKER = /\b(?:united states(?: of america)?|usa|u s a|u s)\b/;

export function normalizeLocationText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPart(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/<\/?br\s*\/?>/gi, ";")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

function splitParts(raw: string): string[] {
  return raw
    .replace(/<\/?br\s*\/?>/gi, ";")
    .split(/[;\n]/)
    .flatMap((part) => {
      const clean = cleanPart(part);
      if (!clean) return [];
      return KNOWN_REWRITES[normalizeLocationText(clean)] ?? [clean];
    });
}

function locationType(normalized: string): LocationType {
  if (REMOTE_MARKER.test(normalized)) return "remote";
  if (HYBRID_MARKER.test(normalized)) return "hybrid";
  return "onsite";
}

function explicitForeignCountry(normalized: string): string | null {
  // Strong US evidence wins the "IN"/"CA"-style token collisions below.
  if (US_MARKER.test(normalized)) return null;
  for (const [alias, code] of COUNTRY_ALIASES) {
    const pattern = new RegExp(`(?:^|\\s)${alias.replace(/ /g, "\\s+")}(?:$|\\s)`);
    if (pattern.test(normalized)) return code;
  }
  return null;
}

function territoryCode(normalized: string): string | null {
  for (const [alias, code] of Object.entries(TERRITORIES)) {
    const pattern = new RegExp(
      `(?:^|\\s)${alias.replace(/ /g, "\\s+")}(?:$|\\s)`,
    );
    if (pattern.test(normalized)) return code;
  }
  return null;
}

function stateCode(part: string): string | null {
  const segments = part.split(",").map(normalizeLocationText).filter(Boolean);
  const suffix = segments.at(-1) ?? "";
  const fullName = STATE_CODES[suffix];
  if (fullName) return fullName;

  const rawSuffix = part.split(",").at(-1)?.trim() ?? "";
  if (/^[A-Z]{2}$/.test(rawSuffix) && VALID_STATE_CODES.has(rawSuffix)) {
    return rawSuffix;
  }
  return null;
}

function cityName(part: string, type: LocationType): string | null {
  if (type === "remote") return null;
  const first = cleanPart(part.split(",", 1)[0] ?? "")
    .replace(/^(?:hybrid|onsite)(?:\s+in)?\s+/i, "")
    .trim();
  if (!first || normalizeLocationText(first) in TERRITORIES) return null;
  return first;
}

function metroId(city: string | null): string | null {
  return city ? METROS[normalizeLocationText(city)] ?? null : null;
}

function entry(
  raw: string,
  overrides: Partial<StructuredLocation>,
): StructuredLocation {
  const normalized = normalizeLocationText(raw);
  const type = overrides.location_type ?? locationType(normalized);
  const city = overrides.city === undefined ? cityName(raw, type) : overrides.city;
  return {
    raw_location: raw,
    country_code: null,
    region_code: null,
    city,
    metro_id: metroId(city),
    location_type: type,
    normalization_confidence: "low",
    eligible: false,
    evidence: [],
    quarantine_reason: "ambiguous_physical",
    ...overrides,
  };
}

function normalizePart(
  part: string,
  options: LocationNormalizationOptions,
): StructuredLocation {
  const normalized = normalizeLocationText(part);
  const type = locationType(normalized);

  if (WORLDWIDE_MARKER.test(normalized)) {
    return entry(part, {
      location_type: type,
      normalization_confidence: "high",
      evidence: ["worldwide marker"],
      quarantine_reason: "worldwide",
    });
  }

  if (normalized === "amsterdam nh" || normalized.startsWith("amsterdam nh ")) {
    return entry(part, {
      country_code: "NL",
      region_code: "NH",
      city: "Amsterdam",
      metro_id: null,
      normalization_confidence: "high",
      evidence: ["known Amsterdam/North Holland collision"],
      quarantine_reason: "explicit_foreign",
    });
  }

  const foreignCountry = explicitForeignCountry(normalized);
  if (foreignCountry) {
    return entry(part, {
      country_code: foreignCountry,
      normalization_confidence: "high",
      evidence: [`explicit country ${foreignCountry}`],
      quarantine_reason: "explicit_foreign",
    });
  }

  const territory = territoryCode(normalized);
  if (territory) {
    return entry(part, {
      country_code: "US",
      region_code: territory,
      normalization_confidence: "high",
      eligible: true,
      evidence: [`US territory ${territory}`],
      quarantine_reason: null,
    });
  }

  const region = stateCode(part);
  if (region) {
    return entry(part, {
      country_code: "US",
      region_code: region,
      normalization_confidence: "high",
      eligible: true,
      evidence: [`US state ${region}`],
      quarantine_reason: null,
    });
  }

  if (US_MARKER.test(normalized)) {
    return entry(part, {
      country_code: "US",
      city: type === "remote" ? null : cityName(part, type),
      normalization_confidence: "high",
      eligible: true,
      evidence: ["explicit United States marker"],
      quarantine_reason: null,
    });
  }

  if (type === "remote") {
    if (options.sourceUsOnly) {
      return entry(part, {
        country_code: "US",
        city: null,
        normalization_confidence: "medium",
        eligible: true,
        evidence: ["source feed is explicitly US-only"],
        quarantine_reason: null,
      });
    }
    return entry(part, {
      city: null,
      evidence: ["remote without explicit country evidence"],
      quarantine_reason: "ambiguous_remote",
    });
  }

  if (options.sourceUsOnly) {
    return entry(part, {
      country_code: "US",
      normalization_confidence: "medium",
      eligible: true,
      evidence: ["source feed is explicitly US-only"],
      quarantine_reason: null,
    });
  }

  return entry(part, {
    evidence: ["no explicit US country or state evidence"],
    quarantine_reason: "ambiguous_physical",
  });
}

function confidenceRank(value: NormalizationConfidence): number {
  return { low: 0, medium: 1, high: 2 }[value];
}

export function normalizeStructuredLocation(
  rawLocation: string | null | undefined,
  options: LocationNormalizationOptions = {},
): NormalizedLocationResult {
  const raw = cleanPart((rawLocation ?? "").slice(0, 10_000));
  if (!raw) {
    const blank = entry("", {
      city: null,
      metro_id: null,
      evidence: ["blank source location"],
      quarantine_reason: "blank",
    });
    return {
      raw_location: "",
      locations: [blank],
      display: "",
      eligible: false,
      normalization_confidence: "low",
      quarantined: true,
      quarantine_reasons: ["blank"],
    };
  }

  const locations = splitParts(raw).map((part) => normalizePart(part, options));
  const accepted = locations.filter((location) => location.eligible);
  const display = accepted.map((location) => location.raw_location).join("; ");
  const confidence = accepted.reduce<NormalizationConfidence>(
    (lowest, location) =>
      confidenceRank(location.normalization_confidence) < confidenceRank(lowest)
        ? location.normalization_confidence
        : lowest,
    "high",
  );
  const reasons = [
    ...new Set(
      locations.flatMap((location) =>
        location.quarantine_reason ? [location.quarantine_reason] : [],
      ),
    ),
  ];

  return {
    raw_location: raw,
    locations,
    display,
    eligible: accepted.length > 0,
    normalization_confidence: accepted.length > 0 ? confidence : "low",
    quarantined: accepted.length === 0,
    quarantine_reasons: reasons,
  };
}
