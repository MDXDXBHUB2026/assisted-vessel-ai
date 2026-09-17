/**
 * Verification state of a single traceability row. This is deliberately explicit: a matrix that
 * renders every row identically cannot distinguish "verified by an automated test" from
 * "intended to be verified", and an assurance artifact that overstates its own evidence is worse
 * than one that has none.
 */
export type VerificationStatus =
  /** Covered by an automated test that exists and runs in CI. */
  | 'verified'
  /** Partially covered — some aspect is automated, the rest is manual or outstanding. */
  | 'partial'
  /** Not yet verified by any automated test. Stated plainly rather than implied. */
  | 'not_verified'

export interface TraceabilityRow {
  businessObjective: string
  operationalRequirement: string
  systemRequirement: string
  useCase: string
  hazardOrConstraint: string
  component: string
  testScenario: string
  verificationEvidence: string
  verificationStatus: VerificationStatus
}

export type ArtifactStatus = 'complete' | 'in_progress' | 'planned'

export interface EngineeringArtifact {
  id: string
  title: string
  status: ArtifactStatus
  summary: string
  /** In-app route, if this artifact is represented as a live view rather than only a document. */
  route?: string
  /** Path relative to docs/, if this artifact is a standalone document. */
  docPath?: string
}
