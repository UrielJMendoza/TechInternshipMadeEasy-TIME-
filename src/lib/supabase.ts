import { createClient } from "@supabase/supabase-js";

// Fallbacks are the project's *public* credentials — the publishable key is
// shipped to every browser by design; RLS restricts it to reads and the
// secret-gated RPCs. Env vars override for forks/local overrides.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://ogkocdharscqzdrnlpnq.supabase.co";
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_ejWVjfUaEx5WAdrN72s7FQ_RwO7CDEh";

export function supabase() {
  return createClient(URL, KEY, { auth: { persistSession: false } });
}
