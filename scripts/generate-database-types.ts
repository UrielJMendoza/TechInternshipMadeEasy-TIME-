import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputPath = path.join(process.cwd(), "src/lib/database.types.ts");
const executable = path.join(
  process.cwd(),
  "node_modules/.bin/supabase",
);

function generatedTypes(): string {
  return execFileSync(
    executable,
    ["gen", "types", "--local", "--schema", "public"],
    {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        SUPABASE_TELEMETRY_DISABLED: "1",
      },
    },
  );
}

async function main(): Promise<void> {
  const generated = generatedTypes();
  if (process.argv.includes("--check")) {
    const committed = await readFile(outputPath, "utf8");
    if (committed !== generated) {
      throw new Error(
        "Generated Supabase types have drifted. Run npm run types:generate after resetting the local database.",
      );
    }
    console.log("generated Supabase types match the local schema");
    return;
  }

  await writeFile(outputPath, generated, "utf8");
  console.log(`wrote ${path.relative(process.cwd(), outputPath)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
