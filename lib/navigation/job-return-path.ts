const RETURN_PATH_ORIGIN = "https://timley.invalid";
const MAX_RETURN_PATH_LENGTH = 1_200;
const ALLOWED_RETURN_PATHS = new Set(["/", "/jobs", "/saved"]);

type ReturnPathInput = string | string[] | null | undefined;

/**
 * Keeps job-detail back links inside Timley and limits them to pages that can
 * actually contain a job card. The origin check also catches browser URL
 * edge-cases such as backslash-based protocol-relative URLs.
 */
export function sanitizeJobReturnPath(
  input: ReturnPathInput,
): string {
  const candidate = Array.isArray(input) ? input[0] : input;
  if (
    !candidate ||
    candidate.length > MAX_RETURN_PATH_LENGTH ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//")
  ) {
    return "/jobs";
  }

  try {
    const parsed = new URL(candidate, RETURN_PATH_ORIGIN);
    if (
      parsed.origin !== RETURN_PATH_ORIGIN ||
      parsed.username ||
      parsed.password ||
      !ALLOWED_RETURN_PATHS.has(parsed.pathname)
    ) {
      return "/jobs";
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/jobs";
  }
}

export function jobDetailHref(jobId: string, returnPath: string): string {
  const params = new URLSearchParams({
    returnTo: sanitizeJobReturnPath(returnPath),
  });
  return `/jobs/${encodeURIComponent(jobId)}?${params.toString()}`;
}
