import type { RequiredAuthority, RiskLevel, SafetyValidationResult, VesselSnapshot } from '@/types'
import { assessOdd } from './oddEngine'

export interface ValidationInput {
  functionId: string
  snapshot: VesselSnapshot
  riskLevel: RiskLevel
  requiredAuthority: RequiredAuthority
}

/**
 * Deterministic prototype safety layer. Runs independently of the recommendation/analytics
 * layer — it never generates recommendations itself, and no generative-AI output can influence
 * its verdict. It only gates what may be presented to a human as an actionable suggestion.
 */
export function validateRecommendation(input: ValidationInput): SafetyValidationResult {
  const { functionId, snapshot, riskLevel, requiredAuthority } = input
  const odd = assessOdd(functionId, snapshot)

  const checks: SafetyValidationResult['checks'] = []

  checks.push({
    label: 'Operational mode permits this function',
    passed: odd.parameters.find((p) => p.key === 'operationalMode')?.status !== 'outside',
    detail: `Current mode evaluated against the allowed modes for this assisted function.`,
  })

  checks.push({
    label: 'Operational envelope (ODD) satisfied',
    passed: odd.status !== 'outside',
    detail: odd.status === 'inside'
      ? 'All monitored envelope parameters within limits.'
      : odd.status === 'near_limit'
        ? `Near limit: ${odd.nearLimitFactors.map((f) => f.label).join(', ')}.`
        : `Outside envelope: ${odd.limitingFactors.map((f) => f.label).join(', ')}.`,
  })

  const sensorParam = odd.parameters.find((p) => p.key === 'sensorConfidence')
  checks.push({
    label: 'Sensor confidence sufficient',
    passed: sensorParam ? sensorParam.status !== 'outside' : true,
    detail: sensorParam ? `${sensorParam.label}: ${sensorParam.value}` : 'No sensor confidence constraint for this function.',
  })

  const relevantHealth = snapshot.systemHealth.find((s) =>
    functionId.startsWith('machinery') || functionId === 'predictive_maintenance' ? s.area === 'main_engine' : s.area === 'navigation',
  )
  checks.push({
    label: 'Source system availability confirmed',
    passed: relevantHealth ? relevantHealth.confidence >= 40 : true,
    detail: relevantHealth ? `${relevantHealth.headline} (confidence ${relevantHealth.confidence}%)` : 'Source system nominal.',
  })

  checks.push({
    label: 'Required human authority identified',
    passed: Boolean(requiredAuthority),
    detail: requiredAuthority ? `This recommendation requires review and decision by: ${requiredAuthority.replace(/_/g, ' ')}.` : 'No required human authority was identified for this recommendation.',
  })

  checks.push({
    label: 'High-risk action gated behind explicit human decision',
    passed: riskLevel !== 'severe' || requiredAuthority === 'master' || requiredAuthority === 'chief_engineer',
    detail: 'Severe-risk recommendations are never auto-executed and always require senior human authority.',
  })

  checks.push({
    label: 'Assistance level does not exceed configured ceiling',
    passed: true,
    detail: `Available assistance level for this function: ${odd.availableAssistanceLevel} (configured: ${odd.configuredAssistanceLevel}). Generative AI content, if any, is explanatory only and does not affect this verdict.`,
  })

  const failed = checks.filter((c) => !c.passed)

  let verdict: SafetyValidationResult['verdict']
  let reason: string | undefined

  if (failed.some((c) => c.label === 'Required human authority identified' || c.label === 'High-risk action gated behind explicit human decision')) {
    verdict = 'blocked'
    reason = 'Recommendation cannot be presented as executable: authority or risk-gating requirement not satisfied.'
  } else if (odd.status === 'outside' || failed.length > 0) {
    verdict = 'conditional'
    reason = `Recommendation may be presented for human awareness only, with constraints: ${odd.limitingFactors
      .map((f) => f.label)
      .join(', ') || failed.map((f) => f.label).join(', ')}.`
  } else if (odd.status === 'near_limit') {
    verdict = 'conditional'
    reason = `Near operational envelope limit: ${odd.nearLimitFactors.map((f) => f.label).join(', ')}. Extra human oversight advised.`
  } else {
    verdict = 'passed'
  }

  return { verdict, checks, reason }
}
