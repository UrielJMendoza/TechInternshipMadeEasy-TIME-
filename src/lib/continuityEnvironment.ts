interface ContinuityEnvironment {
  NEXT_PUBLIC_CONTINUITY_PROVIDER?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}

/**
 * Keep the expensive account-continuity client boundary off anonymous pages
 * unless the deployment has explicitly opted in with a complete public
 * Supabase configuration. The provider still performs its own strict URL and
 * key validation before it can connect.
 */
export function hasConfiguredContinuity(
  environment: ContinuityEnvironment = process.env as ContinuityEnvironment,
): boolean {
  const provider = environment.NEXT_PUBLIC_CONTINUITY_PROVIDER?.trim();
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publicKey =
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  return provider === "supabase" && Boolean(url && publicKey);
}
