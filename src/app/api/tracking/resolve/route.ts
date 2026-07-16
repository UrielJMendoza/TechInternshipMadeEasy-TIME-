import { z } from "zod";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const ResolveRequestSchema = z.object({
  urls: z.array(
    z.string().trim().max(2048).url().refine(
      (value) => new URL(value).protocol === "https:",
      "Only HTTPS URLs can be resolved",
    ),
  ).max(100),
}).strict();

interface AliasRow {
  url_hash: string;
  tracking_key: string;
}

interface ResolverDependencies {
  resolve: (hashes: string[]) => Promise<AliasRow[]>;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function defaultResolve(hashes: string[]): Promise<AliasRow[]> {
  const { data, error } = await supabase().rpc(
    "resolve_job_url_aliases",
    { p_url_hashes: hashes },
  );
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function handleTrackingAliasRequest(
  request: Request,
  dependencies: ResolverDependencies = { resolve: defaultResolve },
): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: { allow: "POST", "cache-control": "no-store" } },
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return Response.json(
      { error: "Request body is too large" },
      { status: 413, headers: { "cache-control": "no-store" } },
    );
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return Response.json(
      { error: "Request body is too large" },
      { status: 413, headers: { "cache-control": "no-store" } },
    );
  }

  let input: z.infer<typeof ResolveRequestSchema>;
  try {
    input = ResolveRequestSchema.parse(JSON.parse(rawBody));
  } catch {
    return Response.json(
      { error: "Invalid alias request" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const urls = [...new Set(input.urls)];
  const urlHashes = await Promise.all(
    urls.map(async (url) => [url, await sha256(url)] as const),
  );
  try {
    const rows = await dependencies.resolve(urlHashes.map(([, hash]) => hash));
    const keyByHash = new Map(rows.map((row) => [row.url_hash, row.tracking_key]));
    const aliases = Object.fromEntries(
      urlHashes.flatMap(([url, hash]) => {
        const trackingKey = keyByHash.get(hash);
        return trackingKey ? [[url, trackingKey]] : [];
      }),
    );
    return Response.json(
      { aliases },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    console.error("tracking alias resolution failed", error);
    return Response.json(
      { error: "Alias resolution is temporarily unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleTrackingAliasRequest(request);
}

export async function GET(): Promise<Response> {
  return handleTrackingAliasRequest(new Request("http://local", { method: "GET" }));
}
