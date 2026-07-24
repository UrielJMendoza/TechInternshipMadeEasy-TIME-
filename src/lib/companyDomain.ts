// Company name -> web domain, so we can pull a real favicon/logo.
// Most names resolve with the heuristic guesser; the curated map only holds the
// ones the guess gets wrong (abbreviations, holding-company names, .org/.io TLDs,
// shared brands). Keys are lowercased and stripped of punctuation — see norm().

function norm(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Corporate suffixes that never belong in a domain guess.
const DROP_WORDS = new Set([
  "inc", "llc", "corp", "corporation", "co", "ltd", "plc", "company",
  "the", "group", "holdings", "technologies", "technology", "labs",
  "systems", "solutions", "international", "global", "financial",
]);

const CURATED: Record<string, string> = {
  "jp morgan chase": "jpmorgan.com",
  "jpmorgan chase": "jpmorgan.com",
  "goldman sachs": "goldmansachs.com",
  "susquehanna international group (sig)": "sig.com",
  "susquehanna international group": "sig.com",
  "citadel securities": "citadelsecurities.com",
  citadel: "citadel.com",
  "jump trading": "jumptrading.com",
  "imc trading": "imc.com",
  "jane street": "janestreet.com",
  optiver: "optiver.com",
  "point72": "point72.com",
  "walleye capital": "walleyecapital.com",
  walleye: "walleyecapital.com",
  "virtu financial": "virtu.com",
  "dv trading": "dvtrading.co",
  "aquatic capital management": "aquatic.com",
  "stevens capital management": "scm-lp.com",
  "five rings": "fiverings.com",
  "hudson river trading": "hudsonrivertrading.com",
  "two sigma": "twosigma.com",
  "de shaw": "deshaw.com",
  "d e shaw": "deshaw.com",
  "capital one": "capitalone.com",
  "royal bank of canada": "rbc.com",
  "northern trust": "northerntrust.com",
  vanguard: "vanguard.com",
  "northwestern mutual": "northwesternmutual.com",
  travelers: "travelers.com",
  schroders: "schroders.com",
  "manulife financial": "manulife.com",
  "definity financial": "definity.com",
  "berkshire hathaway energy": "brkenergy.com",
  "the boeing company": "boeing.com",
  boeing: "boeing.com",
  "northrop grumman": "northropgrumman.com",
  "l3harris technologies": "l3harris.com",
  l3harris: "l3harris.com",
  rtx: "rtx.com",
  "general dynamics mission systems": "gd.com",
  "general dynamics information technology": "gdit.com",
  "bae systems": "baesystems.com",
  leidos: "leidos.com",
  peraton: "peraton.com",
  amentum: "amentum.com",
  akima: "akima.com",
  anduril: "anduril.com",
  saronic: "saronic.com",
  hermeus: "hermeus.com",
  aerovironment: "avinc.com",
  "lawrence livermore national laboratory (llnl)": "llnl.gov",
  "lawrence livermore national laboratory": "llnl.gov",
  spacex: "spacex.com",
  tesla: "tesla.com",
  "base power": "basepowercompany.com",
  neuralink: "neuralink.com",
  figure: "figure.ai",
  "atomic semi": "atomicsemi.com",
  tenstorrent: "tenstorrent.com",
  quadric: "quadric.io",
  graphcore: "graphcore.ai",
  ambarella: "ambarella.com",
  "cirrus logic": "cirrus.com",
  "microchip technology": "microchip.com",
  "texas instruments": "ti.com",
  onsemi: "onsemi.com",
  "kla corporation": "kla.com",
  kla: "kla.com",
  "applied materials": "appliedmaterials.com",
  "cadence design systems": "cadence.com",
  "asm international": "asm.com",
  sandisk: "sandisk.com",
  google: "google.com",
  nvidia: "nvidia.com",
  intel: "intel.com",
  "samsung research america": "samsung.com",
  nokia: "nokia.com",
  ciena: "ciena.com",
  tiktok: "tiktok.com",
  bytedance: "bytedance.com",
  tencent: "tencent.com",
  apple: "apple.com",
  amazon: "amazon.com",
  cloudflare: "cloudflare.com",
  hp: "hp.com",
  "hp inc": "hp.com",
  chevron: "chevron.com",
  accenture: "accenture.com",
  "lockheed martin": "lockheedmartin.com",
  "the trade desk": "thetradedesk.com",
  meta: "meta.com",
  microsoft: "microsoft.com",
  oracle: "oracle.com",
  linkedin: "linkedin.com",
  servicenow: "servicenow.com",
  cisco: "cisco.com",
  fortinet: "fortinet.com",
  "palo alto networks": "paloaltonetworks.com",
  palantir: "palantir.com",
  notion: "notion.so",
  anthropic: "anthropic.com",
  "together ai": "together.ai",
  "plusai": "plus.ai",
  "ai fund": "aifund.ai",
  "invisible technologies": "invisible.co",
  "invisible technologies ai": "invisible.co",
  etched: "etched.com",
  etchedai: "etched.com",
  canonical: "canonical.com",
  formlabs: "formlabs.com",
  whoop: "whoop.com",
  handshake: "joinhandshake.com",
  truveta: "truveta.com",
  "lila sciences": "lila.ai",
  uncountable: "uncountable.com",
  "x development": "x.company",
  "expedia group": "expediagroup.com",
  fanatics: "fanatics.com",
  "the walt disney company": "disney.com",
  "the home depot": "homedepot.com",
  walmart: "walmart.com",
  copart: "copart.com",
  pylon: "usepylon.com",
  "pylon labs": "usepylon.com",
  ancestry: "ancestry.com",
  adt: "adt.com",
  "general motors": "gm.com",
  "gm financial": "gmfinancial.com",
  "john deere": "deere.com",
  caterpillar: "caterpillar.com",
  cummins: "cummins.com",
  "trane technologies": "tranetechnologies.com",
  "radiance technologies": "radiancetech.com",
  honeywell: "honeywell.com",
  vertiv: "vertiv.com",
  "ge healthcare": "gehealthcare.com",
  "danaher corporation": "danaher.com",
  danaher: "danaher.com",
  canon: "usa.canon.com",
  jabil: "jabil.com",
  magna: "magna.com",
  "marmon holdings": "marmon.com",
  "ul solutions": "ul.com",
  "nrg energy": "nrg.com",
  "metropolitan transportation authority": "mta.info",
  "boston consulting group": "bcg.com",
  burson: "bursonglobal.com",
  "torc robotics": "torc.ai",
  zoox: "zoox.com",
  "rivian and volkswagen group technologies": "rivian.com",
  "equipmentshare": "equipmentshare.com",
  "medpace": "medpace.com",
  eurofins: "eurofins.com",
  thyssenkrupp: "thyssenkrupp.com",
  "bosch home comfort": "bosch.com",
  "trane": "trane.com",
};

/** Guess a domain when the name isn't in CURATED: drop suffix words, join, .com. */
function guess(name: string): string {
  const words = norm(name)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, "")
    .split(" ")
    .filter((w) => w && !DROP_WORDS.has(w));
  if (words.length === 0) return "";
  return `${words.join("")}.com`;
}

/** Best-effort web domain for a company, or "" if we can't form one. */
export function companyDomain(company: string): string {
  const key = norm(company);
  return CURATED[key] ?? guess(company);
}

/** Curated domains are safe for the public marketing marquee. */
export function knownCompanyDomain(company: string): string | null {
  return CURATED[norm(company)] ?? null;
}
