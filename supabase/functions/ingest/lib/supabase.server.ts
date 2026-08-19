import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { runtimeEnv } from "./runtimeEnv.ts";

let serviceClient: SupabaseClient<Database> | null = null;

function serviceKey(): string | undefined {
  const namedKeys = runtimeEnv("SUPABASE_SECRET_KEYS");
  if (namedKeys) {
    try {
      const parsed: unknown = JSON.parse(namedKeys);
      if (typeof parsed === "object" && parsed !== null) {
        const defaultKey = (parsed as Record<string, unknown>).default;
        if (typeof defaultKey === "string" && defaultKey) return defaultKey;
      }
    } catch {
      // Fall back to the single-key environment variables below.
    }
  }

  return (
    runtimeEnv("SUPABASE_SECRET_KEY") ??
    runtimeEnv("SUPABASE_SERVICE_ROLE_KEY")
  );
}

/** Server-only ingestion client. No publishable credential may write data. */
export function serviceSupabase(): SupabaseClient<Database> {
  if (typeof document !== "undefined") {
    throw new Error("The Supabase service client is server-only");
  }
  if (serviceClient) return serviceClient;

  const url = runtimeEnv("SUPABASE_URL") ?? runtimeEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = serviceKey();
  if (!url || !key) {
    throw new Error("Supabase service configuration is missing");
  }

  serviceClient = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return serviceClient;
}
