import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

export const INGEST_ARTIFACT_FILES = [
  "supabase/functions/deno.json",
  "supabase/functions/ingest/index.ts",
  "src/lib/auth.ts",
  "src/lib/database.types.ts",
  "src/lib/edgeIngestAuth.ts",
  "src/lib/jobLocations.ts",
  "src/lib/jobTerms.ts",
  "src/lib/runtimeEnv.ts",
  "src/lib/supabase.server.ts",
  "src/lib/types.ts",
  "src/lib/usLocations.ts",
  "src/lib/ingest/contracts.ts",
  "src/lib/ingest/fetch.ts",
  "src/lib/ingest/location.ts",
  "src/lib/ingest/normalize.ts",
  "src/lib/ingest/run.ts",
  "src/lib/ingest/schemas.ts",
  "src/lib/ingest/sourceRegistry.ts",
  "src/lib/ingest/sources/northwestern-quant.ts",
  "src/lib/ingest/sources/simplify.ts",
  "src/lib/ingest/sources/speedy.ts",
  "src/lib/ingest/sources/vansh.ts",
  "src/lib/ingest/sources/zapply.ts",
  "src/lib/ingest/sources/zshah.ts",
] as const;

const GENERATED_IMPORTS = new Set([
  "supabase/functions/ingest/manifest.ts",
]);

function relativeImports(source: string): string[] {
  const imports = new Set<string>();
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier?.startsWith(".")) imports.add(specifier);
    }
  }
  return [...imports];
}

async function resolveLocalImport(
  root: string,
  importer: string,
  specifier: string,
): Promise<string> {
  const base = path.resolve(root, path.dirname(importer), specifier);
  const candidates = path.extname(base)
    ? [base]
    : [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return path.relative(root, candidate).split(path.sep).join("/");
    } catch {
      // Try the next supported TypeScript import form.
    }
  }
  throw new Error(`Unable to resolve ${specifier} imported by ${importer}`);
}

async function validateImportClosure(root: string): Promise<void> {
  const included = new Set<string>(INGEST_ARTIFACT_FILES);
  if (included.size !== INGEST_ARTIFACT_FILES.length) {
    throw new Error("The ingestion artifact file list contains duplicates");
  }

  for (const importer of INGEST_ARTIFACT_FILES) {
    if (!/\.[cm]?[jt]sx?$/.test(importer)) continue;
    const source = await readFile(path.join(root, importer), "utf8");
    for (const specifier of relativeImports(source)) {
      const resolved = await resolveLocalImport(root, importer, specifier);
      if (!included.has(resolved) && !GENERATED_IMPORTS.has(resolved)) {
        throw new Error(
          `${resolved}, imported by ${importer}, is missing from the ingestion artifact`,
        );
      }
    }
  }
}

export async function ingestArtifactChecksum(
  root = process.cwd(),
): Promise<string> {
  await validateImportClosure(root);
  const hash = createHash("sha256");
  for (const relativePath of INGEST_ARTIFACT_FILES) {
    hash.update(`${relativePath}\0`);
    hash.update(await readFile(path.join(root, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}
