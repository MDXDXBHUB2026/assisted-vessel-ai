export interface TraceabilityRow {
  businessObjective: string
  operationalRequirement: string
  systemRequirement: string
  useCase: string
  hazardOrConstraint: string
  component: string
  testScenario: string
  verificationEvidence: string
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
