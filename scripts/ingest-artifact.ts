import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

export const INGEST_ARTIFACT_FILES = [
  "supabase/functions/ingest/deno.json",
  "supabase/functions/ingest/index.ts",
  "supabase/functions/ingest/lib/auth.ts",
  "supabase/functions/ingest/lib/database.types.ts",
  "supabase/functions/ingest/lib/edgeIngestAuth.ts",
  "supabase/functions/ingest/lib/jobLocations.ts",
  "supabase/functions/ingest/lib/jobTerms.ts",
  "supabase/functions/ingest/lib/runtimeEnv.ts",
  "supabase/functions/ingest/lib/supabase.server.ts",
  "supabase/functions/ingest/lib/types.ts",
  "supabase/functions/ingest/lib/usLocations.ts",
  "supabase/functions/ingest/lib/ingest/contracts.ts",
  "supabase/functions/ingest/lib/ingest/fetch.ts",
  "supabase/functions/ingest/lib/ingest/location.ts",
  "supabase/functions/ingest/lib/ingest/normalize.ts",
  "supabase/functions/ingest/lib/ingest/run.ts",
  "supabase/functions/ingest/lib/ingest/schemas.ts",
  "supabase/functions/ingest/lib/ingest/sourceRegistry.ts",
  "supabase/functions/ingest/lib/ingest/sources/northwestern-quant.ts",
  "supabase/functions/ingest/lib/ingest/sources/official-ats.ts",
  "supabase/functions/ingest/lib/ingest/sources/simplify.ts",
  "supabase/functions/ingest/lib/ingest/sources/speedy.ts",
  "supabase/functions/ingest/lib/ingest/sources/vansh.ts",
  "supabase/functions/ingest/lib/ingest/sources/zapply.ts",
  "supabase/functions/ingest/lib/ingest/sources/zshah.ts",
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
