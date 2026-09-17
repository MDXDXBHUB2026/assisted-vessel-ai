import type { HazardCategory, RequiredAuthority, RiskLevel, SafetyValidationResult, SystemHealthSummary, VesselSnapshot } from '@ave/core-domain/types'
import { assistanceLevelRank, authorityRank, isRequiredAuthority, isVesselAuthority, riskLevelRank } from '@ave/core-domain/types'
import { assessOdd } from './oddEngine'

export interface ValidationInput {
  functionId: string
  snapshot: VesselSnapshot
  riskLevel: RiskLevel
  requiredAuthority: RequiredAuthority
  /** See `assessOdd` — categories with an open, intolerable-band hazard. Defaults to none. */
  activeHazardCategories?: HazardCategory[]
  /**
   * The category of the specific hazard this recommendation was generated from, if any.
   * `functionId`'s declared `hazardSensitiveCategories` may not include this category — the two
   * are independent choices — so this recommendation's own hazard-derived check (below) must not
   * rely solely on the function's declared sensitivity to catch a recommendation whose own
   * originating hazard is open and intolerable.
   */
  originatingHazardCategory?: HazardCategory
}

/** A check whose failure means the recommendation must never be presented as executable. */
const BLOCKING_CHECKS = [
  'Required human authority is valid and identified',
  'Function permitted in current operational mode',
  'Assistance level does not exceed declared ceiling',
  'High-consequence action gated behind vessel authority',
  'Source system data available',
] as const

/**
 * Deterministic prototype safety layer. Runs independently of the recommendation/analytics
 * layer — it never generates recommendations itself, and no generative-AI output can influence
 * its verdict. It only gates what may be presented to a human as an actionable suggestion.
 *
 * Verdict model:
 *   BLOCKED     — a precondition for acting at all is unmet. Never presented as executable.
 *   CONDITIONAL — actionable only with explicit extra human oversight; constraints are named.
 *   PASSED      — all checks satisfied.
 *
 * Every check below must be capable of failing against a state the system can actually reach.
 * A check hardcoded to pass is worse than no check: it renders to the operator as validated.
 */
export function validateRecommendation(input: ValidationInput): SafetyValidationResult {
  const { functionId, snapshot, riskLevel, requiredAuthority, activeHazardCategories = [], originatingHazardCategory } = input
  const odd = assessOdd(functionId, snapshot, activeHazardCategories)

  const checks: SafetyValidationResult['checks'] = []

  // 1. Authority is present AND is a recognised value. A `Boolean(...)` test on a non-optional
  //    union is vacuous; this guard catches an absent or unrecognised value arriving from an
  //    untyped boundary, which is the only way the field can actually be wrong.
  const authorityValid = isRequiredAuthority(requiredAuthority)
  checks.push({
    label: 'Required human authority is valid and identified',
    passed: authorityValid,
    detail: authorityValid
      ? `This recommendation requires review and decision by: ${requiredAuthority.replace(/_/g, ' ')}.`
      : 'No recognised human authority was identified for this recommendation.',
  })

  // 2. Operational mode. If the ODD says the function is not offered in this mode, the two
  //    layers must agree: a function that is "not offered" cannot yield an actionable
  //    recommendation. Previously this fell through to CONDITIONAL while the ODD reported L0.
  const modeParam = odd.parameters.find((p) => p.key === 'operationalMode')
  const modePermitted = modeParam !== undefined && modeParam.status !== 'outside'
  checks.push({
    label: 'Function permitted in current operational mode',
    passed: modePermitted,
    detail: modeParam
      ? `Current mode evaluated against the allowed modes for this assisted function: ${modeParam.value}.`
      : 'Operational mode could not be evaluated for this function.',
  })

  // 3. Declared assistance ceiling actually enforced.
  const withinCeiling = assistanceLevelRank(odd.availableAssistanceLevel) <= assistanceLevelRank(odd.maxAssistanceLevel)
  checks.push({
    label: 'Assistance level does not exceed declared ceiling',
    passed: withinCeiling,
    detail: `Available ${odd.availableAssistanceLevel} / configured ${odd.configuredAssistanceLevel} / declared ceiling ${odd.maxAssistanceLevel}. Generative AI content, if any, is explanatory only and does not affect this verdict.`,
  })

  // 4. Operational envelope.
  checks.push({
    label: 'Operational envelope (ODD) satisfied',
    passed: odd.status !== 'outside',
    detail:
      odd.status === 'inside'
        ? 'All monitored envelope parameters within limits.'
        : odd.status === 'near_limit'
          ? `Near limit: ${odd.nearLimitFactors.map((f) => f.label).join(', ')}.`
          : `Outside envelope: ${odd.limitingFactors.map((f) => f.label).join(', ')}.`,
  })

  // 5. Sensor confidence.
  const sensorParam = odd.parameters.find((p) => p.key === 'sensorConfidence')
  checks.push({
    label: 'Sensor confidence sufficient',
    passed: sensorParam ? sensorParam.status !== 'outside' : true,
    detail: sensorParam ? `${sensorParam.label}: ${sensorParam.value}` : 'No sensor confidence constraint for this function.',
  })

  // 6. Source-system data availability — gated on measured feed liveness for the areas this
  //    function actually depends on, NOT on analytical confidence. Model confidence rises as a
  //    fault develops, so gating on it let a badly degraded engine report maximum availability.
  //    A required area that is missing from the snapshot fails closed rather than passing.
  const requiredAreas = odd.requiredSourceAreas
  const relevant: SystemHealthSummary[] = requiredAreas
    .map((area) => snapshot.systemHealth.find((s) => s.area === area))
    .filter((s): s is SystemHealthSummary => s !== undefined)
  const allAreasPresent = relevant.length === requiredAreas.length
  const worstAvailability = relevant.length > 0 ? Math.min(...relevant.map((s) => s.dataAvailabilityPercent)) : 0
  const anyUnavailable = relevant.some((s) => s.availabilityStatus === 'unavailable')
  const sourceAvailable = allAreasPresent && !anyUnavailable && worstAvailability > 0
  checks.push({
    label: 'Source system data available',
    passed: sourceAvailable,
    detail: allAreasPresent
      ? `Required source systems (${requiredAreas.join(', ')}): lowest data availability ${worstAvailability}%.`
      : `One or more required source systems (${requiredAreas.join(', ')}) are not reporting.`,
  })

  // 7. Source-system data quality — a degraded but live feed is a constraint, not a blocker.
  const sourceDegraded = relevant.some((s) => s.availabilityStatus === 'degraded' || s.availabilityStatus === 'stale')
  checks.push({
    label: 'Source system data quality sufficient',
    passed: sourceAvailable && !sourceDegraded,
    detail: sourceDegraded
      ? `Degraded or stale source data on: ${relevant.filter((s) => s.availabilityStatus !== 'ok').map((s) => s.area).join(', ')}.`
      : 'Source system data is current and complete.',
  })

  // 8. Hazard-derived envelope constraint (§6 of docs/safety-intelligence-specification.md). An
  //    open, intolerable-band hazard in a category this function is sensitive to is folded into
  //    the ODD as an ordinary outside-envelope parameter (check 4 above already fails for it via
  //    `odd.status`), but it is also surfaced as its own named check so it is independently
  //    traceable in the audit trail and cannot be missed inside a longer "outside envelope" list.
  const hazardParam = odd.parameters.find((p) => p.key === 'safetyHazard')
  //    A recommendation carrying its own `originatingHazardCategory` is checked against that
  //    category directly, independent of whether `functionId` happens to declare sensitivity to
  //    it — the recommendation exists BECAUSE of that specific hazard, so its own check must fail
  //    while that hazard remains open and intolerable, regardless of which function's ODD it uses
  //    for the rest of this validation.
  const originatingHazardStillOpen = originatingHazardCategory !== undefined && activeHazardCategories.includes(originatingHazardCategory)
  const hazardCheckPassed = originatingHazardStillOpen ? false : hazardParam ? hazardParam.status !== 'outside' : true
  checks.push({
    label: 'Not constrained by an active intolerable safety hazard',
    passed: hazardCheckPassed,
    detail: originatingHazardStillOpen
      ? `This recommendation was raised from an open, intolerable-band (RI 8-11) hazard in the ${originatingHazardCategory} category, which remains open.`
      : hazardParam
        ? hazardParam.detail
        : 'This function declares no hazard-category sensitivity.',
  })

  // 9. Risk-appropriate authority. Severe risk requires the Master. High or severe risk requires
  //    an onboard vessel authority — SHORE-003 requires that shore guidance never removes
  //    operational authority from the vessel, so a shore role can never be the authorising
  //    party for a high-consequence onboard action.
  const highConsequence = riskLevelRank(riskLevel) >= riskLevelRank('high')
  //    A hazard-constrained recommendation is raised to the same senior-authority bar as severe
  //    risk (ISM 5.2's Master's-overriding-authority pattern already used in
  //    `decision-engine/hazardLifecycle.ts`'s intolerable-band gate). BLOCKING here, rather than
  //    only escalating the verdict, is the proportionate response: blocking removes the
  //    recommendation from action entirely, which is wrong for e.g. a collision advisory that
  //    should stay actionable at oversight level, but is right for whether a junior authority can
  //    be the one who signs off on it.
  const hazardConstrained = hazardParam?.status === 'outside' || originatingHazardStillOpen
  //    Severe risk (or a hazard-constrained recommendation) requires a SENIOR vessel authority
  //    (Master or Chief Engineer), matching the authority model in docs/conops.md section 3. High
  //    risk requires any onboard vessel authority. Officer-of-the-watch remains the correct
  //    authority for a high-risk collision advisory, so seniority is not raised beyond what the
  //    ConOps actually states outside of these two cases.
  const authorityAdequate =
    !authorityValid
      ? false
      : riskLevel === 'severe' || hazardConstrained
        ? isVesselAuthority(requiredAuthority) && authorityRank(requiredAuthority) >= authorityRank('chief_engineer')
        : highConsequence
          ? isVesselAuthority(requiredAuthority)
          : true
  checks.push({
    label: 'High-consequence action gated behind vessel authority',
    passed: authorityAdequate,
    detail:
      riskLevel === 'severe'
        ? 'Severe-risk recommendations require a senior vessel authority (Master or Chief Engineer) and are never auto-executed.'
        : hazardConstrained
          ? 'Constrained by an open, intolerable-band safety hazard: requires a senior vessel authority (Master or Chief Engineer), per ISM 5.2.'
          : highConsequence
            ? 'High-risk recommendations require an onboard vessel authority; shore roles are advisory only.'
            : 'Risk level does not require senior authority gating.',
  })

  const failed = checks.filter((c) => !c.passed)
  const blockingFailures = failed.filter((c) => (BLOCKING_CHECKS as readonly string[]).includes(c.label))

  let verdict: SafetyValidationResult['verdict']
  let reason: string | undefined

  if (blockingFailures.length > 0) {
    verdict = 'blocked'
    reason = `Recommendation cannot be presented as executable — unmet precondition: ${blockingFailures.map((c) => c.label).join('; ')}.`
  } else if (odd.status === 'outside') {
    verdict = 'conditional'
    reason = `Outside operational envelope (${odd.limitingFactors.map((f) => f.label).join(', ')}). May be presented for human awareness only.`
  } else if (failed.length > 0) {
    verdict = 'conditional'
    reason = `Presented with constraints: ${failed.map((c) => c.label).join('; ')}.`
  } else if (odd.status === 'near_limit') {
    verdict = 'conditional'
    reason = `Near operational envelope limit: ${odd.nearLimitFactors.map((f) => f.label).join(', ')}. Extra human oversight advised.`
  } else {
    verdict = 'passed'
  }

  return { verdict, checks, reason }
}
