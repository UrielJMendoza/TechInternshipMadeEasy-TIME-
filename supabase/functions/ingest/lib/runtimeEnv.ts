type EdgeRuntime = {
  env?: { get(name: string): string | undefined };
};

/** Read configuration in both Node.js and Supabase's Deno Edge runtime. */
export function runtimeEnv(name: string): string | undefined {
  const edge = (globalThis as typeof globalThis & { Deno?: EdgeRuntime }).Deno;
  const edgeValue = edge?.env?.get(name);
  if (edgeValue !== undefined) return edgeValue;

  return typeof process !== "undefined" ? process.env[name] : undefined;
}
