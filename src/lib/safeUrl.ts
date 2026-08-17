const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/**
 * Return one absolute, credential-free HTTP(S) destination or null. This is
 * intentionally shared by ingestion and rendering so legacy database rows
 * cannot bypass newer normalization rules.
 */
export function safeExternalHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!/^https?:\/\//i.test(input) || CONTROL_CHARACTER.test(input)) {
    return null;
  }

  try {
    const url = new URL(input);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
