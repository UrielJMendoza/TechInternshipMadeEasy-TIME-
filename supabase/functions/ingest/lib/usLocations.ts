export type UsLocationPartKind =
  | "physical"
  | "remote"
  | "generic"
  | "foreign"
  | "unknown";

export interface SanitizedUsLocation {
  parts: string[];
  display: string;
  eligible: boolean;
  hasRemote: boolean;
}

export interface UsLocationSanitizationOptions {
  /** Only set from already-normalized structured data with country_code=US. */
  allowAmbiguousRemote?: boolean;
}

const US_STATE_CODES = [
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi",
  "id", "il", "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi",
  "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc",
  "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut",
  "vt", "va", "wa", "wv", "wi", "wy", "dc",
] as const;

const US_STATE_NAMES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
  "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
  "new mexico", "new york", "north carolina", "north dakota", "ohio",
  "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina",
  "south dakota", "tennessee", "texas", "utah", "vermont", "virginia",
  "washington", "west virginia", "wisconsin", "wyoming",
  "district of columbia",
] as const;

const US_STATE_LABELS = new Set<string>([
  ...US_STATE_CODES,
  ...US_STATE_NAMES,
  "d c",
]);

const US_CITY_ONLY_NAMES = [
  "nyc",
  "new york",
  "manhattan",
  "brooklyn",
  "queens",
  "bronx",
  "sf",
  "san francisco",
  "bay area",
  "oakland",
  "berkeley",
  "san jose",
  "mountain view",
  "palo alto",
  "sunnyvale",
  "santa clara",
  "cupertino",
  "redwood city",
  "menlo park",
  "chicago",
  "boston",
  "austin",
  "seattle",
  "dallas",
  "fort worth",
  "houston",
  "atlanta",
  "miami",
  "denver",
  "boulder",
  "phoenix",
  "detroit",
  "pittsburgh",
  "philadelphia",
  "los angeles",
  "la",
  "san diego",
  "long beach",
  "bellevue",
  "redmond",
  "cambridge",
  "minneapolis",
  "nashville",
  "charlotte",
  "raleigh",
  "baltimore",
  "portland",
  "salt lake city",
  "columbus",
  "cincinnati",
  "indianapolis",
  "milwaukee",
  "madison",
  "cleveland",
  "tampa",
  "orlando",
  "irvine",
] as const;

const EXPLICIT_FOREIGN_MARKER =
  /\b(?:united kingdom|uk|canada|israel|south africa|costa rica|netherlands|north holland|nl|germany|france|india|ireland|spain|singapore|switzerland|australia|new zealand|mexico|brazil|argentina|japan|china|hong kong|taiwan|south korea|poland|italy|portugal|sweden|norway|denmark|finland|belgium|austria|romania|hungary|united arab emirates|uae|europe|emea|apac|latin america)\b/;

const AMBIGUOUS_GLOBAL_MARKER =
  /\b(?:worldwide|global|anywhere|international)\b/;

const REMOTE_LANGUAGE = /\b(?:remote|work from home|wfh)\b/;
const GENERIC_US_LANGUAGE =
  /\b(?:united states(?: of america)?|usa|u s a)\b/;
const US_TERRITORY =
  /^(?:puerto rico|guam|us virgin islands|u s virgin islands|northern mariana islands|american samoa)$/;

const KNOWN_FOREIGN_COLLISIONS = new Set([
  // Greenhouse uses NH for North Holland, which collides with New Hampshire.
  "amsterdam nh",
  "amsterdam north holland",
  "buenos aires",
]);

const KNOWN_AMBIGUOUS_REWRITES: Record<string, readonly string[]> = {
  // Northwestern Quant lists office markets with commas, not city/state pairs.
  "chicago puerto rico": ["Chicago, IL", "Puerto Rico"],
  "chicago nyc": ["Chicago, IL", "New York, NY"],
  "chicago austin": ["Chicago, IL", "Austin, TX"],
};

export function normalizeLocationText(
  location: string | null | undefined,
): string {
  return (location ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLocationPart(part: string): string {
  return part
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

function sourceLocationParts(location: string | null | undefined): string[] {
  return (location ?? "")
    .split(";")
    .flatMap((part) => {
      const clean = cleanLocationPart(part);
      if (!clean) return [];
      return KNOWN_AMBIGUOUS_REWRITES[normalizeLocationText(clean)] ?? [clean];
    });
}

/** Whether a label is exactly a US state name/code (used by source adapters). */
export function isUsStateLabel(value: string): boolean {
  return US_STATE_LABELS.has(normalizeLocationText(value));
}

function hasStructuredUsState(part: string): boolean {
  const commaSegments = part
    .split(",")
    .map(normalizeLocationText)
    .filter(Boolean);

  if (
    commaSegments.some(
      (segment, index) => US_STATE_LABELS.has(segment) && (index > 0 || commaSegments.length === 1),
    )
  ) {
    return true;
  }

  const normalized = normalizeLocationText(part);
  if (US_STATE_LABELS.has(normalized)) return true;

  // Full state names are safe as a suffix. Two-letter codes without a comma
  // are accepted only when the source preserved their uppercase formatting,
  // preventing ordinary words such as "in", "or", and "me" from matching.
  if (US_STATE_NAMES.some((state) => normalized.endsWith(` ${state}`))) return true;
  const uppercaseCode = part.trim().match(/(?:^|\s)([A-Z]{2})$/)?.[1]?.toLowerCase();
  return Boolean(uppercaseCode && US_STATE_LABELS.has(uppercaseCode));
}

function hasKnownUsCity(part: string): boolean {
  const normalized = normalizeLocationText(part);
  return US_CITY_ONLY_NAMES.some(
    (city) => normalized === city || normalized.startsWith(`${city} `),
  );
}

function hasExplicitUsRemoteEvidence(normalized: string): boolean {
  return (
    GENERIC_US_LANGUAGE.test(normalized) ||
    /\b(?:us|u s|nationwide|puerto rico|guam|us virgin islands|u s virgin islands|northern mariana islands|american samoa)\b/.test(
      normalized,
    )
  );
}

/** Classify one already-delimited location. Explicit foreign evidence wins. */
export function classifyUsLocationPart(part: string): UsLocationPartKind {
  const normalized = normalizeLocationText(part);
  if (!normalized) return "unknown";

  if (
    KNOWN_FOREIGN_COLLISIONS.has(normalized) ||
    normalized.startsWith("amsterdam nh ") ||
    normalized.startsWith("buenos aires ") ||
    EXPLICIT_FOREIGN_MARKER.test(normalized) ||
    AMBIGUOUS_GLOBAL_MARKER.test(normalized)
  ) {
    return "foreign";
  }

  if (REMOTE_LANGUAGE.test(normalized)) return "remote";
  if (
    GENERIC_US_LANGUAGE.test(normalized) ||
    /^(?:us|u s|nationwide)$/.test(normalized)
  ) {
    return "generic";
  }
  if (US_TERRITORY.test(normalized)) return "physical";
  if (hasStructuredUsState(part) || hasKnownUsCity(part)) return "physical";
  return "unknown";
}

/**
 * Keep only display-safe US parts. Blank locations are ineligible so this
 * read-time sanitizer cannot re-admit rows quarantined during ingestion.
 */
export function sanitizeUsLocation(
  location: string | null | undefined,
  options: UsLocationSanitizationOptions = {},
): SanitizedUsLocation {
  const source = location ?? "";
  const parts: string[] = [];
  const seen = new Set<string>();
  let hasRemote = false;

  for (const part of sourceLocationParts(source)) {
    const kind = classifyUsLocationPart(part);
    if (kind === "foreign" || kind === "unknown") continue;
    if (
      kind === "remote" &&
      !options.allowAmbiguousRemote &&
      !hasExplicitUsRemoteEvidence(normalizeLocationText(part))
    ) {
      continue;
    }

    const key = normalizeLocationText(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    parts.push(part);
    hasRemote ||= kind === "remote";
  }

  return {
    parts,
    display: parts.join("; "),
    eligible: parts.length > 0,
    hasRemote,
  };
}

export function getSafeUsLocationParts(
  location: string | null | undefined,
): string[] {
  return sanitizeUsLocation(location).parts;
}

/** Safe text for cards, search, and server-side defense-in-depth filtering. */
export function getUsLocationDisplay(
  location: string | null | undefined,
  options: UsLocationSanitizationOptions = {},
): string {
  return sanitizeUsLocation(location, options).display;
}

export function isUsLocationEligible(
  location: string | null | undefined,
  options: UsLocationSanitizationOptions = {},
): boolean {
  return sanitizeUsLocation(location, options).eligible;
}

export function isUsRemoteLocation(
  location: string | null | undefined,
  options: UsLocationSanitizationOptions = {},
): boolean {
  return sanitizeUsLocation(location, options).hasRemote;
}
