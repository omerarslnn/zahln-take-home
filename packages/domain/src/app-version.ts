/** A release version as three numbers: major, minor, patch. */
export type AppVersion = readonly [number, number, number];

const VERSION = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;

/**
 * Parses "major.minor.patch" (e.g. "1.0.0"). Anything else, including pre-release suffixes, two-part
 * versions and leading zeros, returns null: the payment gate then fails closed instead of guessing.
 */
export function parseAppVersion(value: string | null | undefined): AppVersion | null {
  const match = value ? VERSION.exec(value) : null;
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Numeric comparison, part by part: 1.10.0 is newer than 1.2.0 (a string compare says the opposite). */
export function compareAppVersions(a: AppVersion, b: AppVersion): -1 | 0 | 1 {
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}
