import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { runtimeEnv } from "./runtimeEnv.ts";

let serviceClient: SupabaseClient<Database> | null = null;

/** Server-only ingestion client. No publishable credential may write data. */
export function serviceSupabase(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    throw new Error("The Supabase service client is server-only");
  }
  if (serviceClient) return serviceClient;

  const url = runtimeEnv("SUPABASE_URL") ?? runtimeEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key =
    runtimeEnv("SUPABASE_SECRET_KEY") ?? runtimeEnv("SUPABASE_SERVICE_ROLE_KEY");
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
