import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let publicClient: SupabaseClient<Database> | null = null;

export function publicSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

/** Lazily initialize so `next build` never contacts production via fallbacks. */
export function supabase(): SupabaseClient<Database> {
  if (publicClient) return publicClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Public Supabase configuration is missing");
  }

  publicClient = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return publicClient;
}
