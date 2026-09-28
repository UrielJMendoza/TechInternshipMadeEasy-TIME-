/**
 * The public reader only ever uses Supabase's publishable key, which is safe
 * to ship and grants nothing beyond row-level-security-approved access. The
 * overrides must never carry a service-role or other privileged key.
 */
const DEFAULT_SUPABASE_URL = "https://ogkocdharscqzdrnlpnq.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ejWVjfUaEx5WAdrN72s7FQ_RwO7CDEh";

function publicSupabaseUrl(value: string | undefined): string {
  if (!value) return DEFAULT_SUPABASE_URL;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.origin;
  } catch {
    // Fall through to the known-good project below.
  }
  return DEFAULT_SUPABASE_URL;
}

function isLegacyAnonKey(value: string): boolean {
  const payload = value.split(".")[1];
  if (!payload) return false;
  try {
    const claims: unknown = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof claims === "object" && claims !== null && (claims as { role?: unknown }).role === "anon";
  } catch {
    return false;
  }
}

function publicSupabaseKey(value: string | undefined): string {
  // Refuse anything that is not a publishable (or legacy anon) key, such as an
  // `sb_secret_` key or a service-role JWT, so a misconfigured environment
  // cannot turn this server-rendered reader into an admin client.
  if (value?.startsWith("sb_publishable_") || (value && isLegacyAnonKey(value))) return value;
  return DEFAULT_SUPABASE_PUBLISHABLE_KEY;
}

export const SUPABASE_URL = publicSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_PUBLISHABLE_KEY = publicSupabaseKey(
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
