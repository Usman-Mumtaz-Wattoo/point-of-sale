/**
 * Validation utilities for organization profile settings.
 */

/**
 * Validates whether a given string is a valid IANA timezone identifier.
 */
export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string" || tz.length > 60) {
    return false;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates whether a given URL is a safe HTTP or HTTPS URL for images.
 * Disallows javascript:, data:, file:, and malformed URIs.
 * Note: Server never fetches this URL.
 */
export function isValidSafeLogoUrl(rawUrl: string): boolean {
  if (rawUrl.length > 500) {
    return false;
  }
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
