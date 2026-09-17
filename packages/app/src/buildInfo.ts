// Set by .github/workflows/deploy.yml's "Build" step from the commit being deployed. Absent in a
// local dev/build (`local`/`null`), so the live site can always be checked against `git log`
// instead of trusted blind — see docs/assumptions.md for the incident this exists to prevent.
export const BUILD_SHA = (import.meta.env.VITE_BUILD_SHA as string | undefined) || 'local'
export const BUILD_TIME_ISO = (import.meta.env.VITE_BUILD_TIME as string | undefined) || null
