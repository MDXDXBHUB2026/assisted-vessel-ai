import type { DataProvenance } from '@/types'
import type { SimulationState } from '@/simulation/state'
import { analyseMainEngine } from '@/decision-engine/machineryAnalytics'
import { correlateAlarms } from '@/decision-engine/alarmCorrelation'
import { OPERATIONAL_MODE_LABELS } from '@/types'
import { attemptConnectedCall } from './connectedGateway'
import { CONNECTED_API_ENDPOINTS } from '../pocMode'

export interface CopilotResponse {
  answer: string
  evidence: string[]
  provenance: DataProvenance
}

const SUGGESTED_QUESTIONS = [
  'Why is machinery risk high?',
  'Which condition requires immediate attention?',
  'Why did navigation assistance degrade?',
  'Which recommendations require my approval?',
  'Why did fuel consumption increase?',
  'What happened during the communication failure?',
  'What does shore support need to review?',
  'What evidence supports this recommendation?',
]

export function suggestedCopilotQuestions(): string[] {
  return SUGGESTED_QUESTIONS
}

/**
 * The Generative-AI service boundary. This interface is deliberately narrow — `ask` is the only
 * contract a calling component depends on — so the deterministic (offline) implementation and a
 * secured connected LLM/RAG implementation are fully interchangeable. Whichever implementation
 * answers, the response is explanatory only: neither is ever consulted by the safety engine, and
 * neither can change a PASSED/CONDITIONAL/BLOCKED verdict.
 */
export interface CopilotAdapter {
  readonly kind: 'deterministic' | 'connected_ai'
  ask(question: string, context: SimulationState): Promise<CopilotResponse>
}

function matches(question: string, ...keywords: string[]): boolean {
  const q = question.toLowerCase()
  return keywords.every((k) => q.includes(k))
}

function rank(h: string): number {
  return { healthy: 0, advisory: 1, warning: 2, critical: 3 }[h as 'healthy' | 'advisory' | 'warning' | 'critical'] ?? 0
}

async function deterministicAsk(question: string, ctx: SimulationState): Promise<CopilotResponse> {
  const engine = analyseMainEngine(ctx.snapshot, ctx.telemetryHistory)
  const { correlated, uncorrelatedCount } = correlateAlarms(ctx.rawAlarms)
  const awaiting = ctx.recommendations.filter((r) => r.status === 'awaiting_decision')

  if (matches(question, 'machinery', 'risk') || matches(question, 'engine')) {
    return {
      answer: `Main engine health score is currently ${engine.healthScore}/100 with an anomaly score of ${engine.anomalyScore}/100. Probable condition: ${engine.probableCondition}. This is driven by an exhaust temperature deviation of ${engine.actualExhaustDeviationC.toFixed(1)}°C (trend ${engine.exhaustSlopePerSample >= 0 ? '+' : ''}${engine.exhaustSlopePerSample.toFixed(2)}/sample) and lubricating oil pressure of ${ctx.snapshot.mainEngine.lubOilPressureBar.toFixed(2)} bar against baseline.`,
      evidence: ['Exhaust temperature sensor array', 'Lubricating oil pressure sensor', 'Machinery Intelligence trend-anomaly model'],
      provenance: 'calculated',
    }
  }

  if (matches(question, 'immediate', 'attention') || matches(question, 'requires', 'attention')) {
    const worst = [...ctx.snapshot.systemHealth].sort((a, b) => rank(b.health) - rank(a.health))[0]
    if (!worst || worst.health === 'healthy') {
      return { answer: 'No system currently requires immediate attention. All monitored areas are within healthy parameters.', evidence: ['Vessel Digital Twin system health summary'], provenance: 'calculated' }
    }
    return {
      answer: `${worst.area.replace(/_/g, ' ')} currently requires the most attention: ${worst.headline} (confidence ${worst.confidence}%). State: ${worst.state.toUpperCase()}.`,
      evidence: ['Vessel Digital Twin system health summary'],
      provenance: 'calculated',
    }
  }

  if (matches(question, 'navigation') && matches(question, 'degrade')) {
    const nav = ctx.snapshot.systemHealth.find((s) => s.area === 'navigation')
    return {
      answer: nav && nav.health !== 'healthy'
        ? `Navigation assistance degraded because: ${nav.headline}. GNSS confidence is ${ctx.snapshot.navigation.gnssConfidence.toFixed(0)}%. Some navigation assistance functions may now be outside their operational envelope — see the Operational Envelope screen for the specific limiting factor.`
        : 'Navigation assistance is currently operating normally with no active degradation.',
      evidence: ['GNSS receiver diagnostics', 'Operational Envelope assessment'],
      provenance: 'calculated',
    }
  }

  if (matches(question, 'recommendation') && (matches(question, 'approval') || matches(question, 'approve'))) {
    if (awaiting.length === 0) return { answer: 'There are no recommendations currently awaiting a human decision.', evidence: ['Human Decision Centre'], provenance: 'calculated' }
    return {
      answer: `${awaiting.length} recommendation(s) are awaiting your decision: ${awaiting.map((r) => r.title).join('; ')}.`,
      evidence: awaiting.map((r) => `Recommendation ${r.id}`),
      provenance: 'calculated',
    }
  }

  if (matches(question, 'fuel') && matches(question, 'increase')) {
    const excess = ctx.snapshot.fuelEnergy.fuelConsumptionRateTonPerDay - ctx.snapshot.fuelEnergy.baselineConsumptionRateTonPerDay
    const excessPercent = (excess / ctx.snapshot.fuelEnergy.baselineConsumptionRateTonPerDay) * 100
    return {
      answer: excessPercent > 5
        ? `Fuel consumption is ${excessPercent.toFixed(0)}% above baseline (${ctx.snapshot.fuelEnergy.fuelConsumptionRateTonPerDay.toFixed(1)} t/day vs ${ctx.snapshot.fuelEnergy.baselineConsumptionRateTonPerDay.toFixed(1)} t/day baseline). Contributing factors may include weather exposure, speed profile or machinery efficiency loss — see Voyage & Energy Intelligence for the current breakdown.`
        : 'Fuel consumption is currently tracking close to baseline for the present speed and loading condition.',
      evidence: ['Fuel flow meters', 'Voyage & Energy Intelligence'],
      provenance: 'calculated',
    }
  }

  if (matches(question, 'communication') && (matches(question, 'failure') || matches(question, 'loss'))) {
    const comms = ctx.snapshot.communications
    return {
      answer: comms.satelliteLinkUp
        ? 'No active ship-shore communications failure. Satellite link is currently up.'
        : `Satellite link is currently down (confidence ${comms.satelliteConfidence.toFixed(0)}%). Communications system state is in fallback — shore-dependent functions are unavailable and onboard assistance continues independently. Last successful shore sync: ${comms.lastShoreSyncIso}.`,
      evidence: ['Satellite link diagnostics', 'Communications system state'],
      provenance: 'calculated',
    }
  }

  if (matches(question, 'shore') && matches(question, 'review')) {
    const openCases = ctx.shoreCases.filter((c) => c.status !== 'closed')
    if (openCases.length === 0) return { answer: 'There are no open shore assistance cases requiring review.', evidence: ['Shore Assisted Operations Centre'], provenance: 'calculated' }
    return {
      answer: `Shore support has ${openCases.length} open case(s): ${openCases.map((c) => `${c.id} (${c.function.replace(/_/g, ' ')}, priority ${c.priority})`).join('; ')}.`,
      evidence: openCases.map((c) => `Shore case ${c.id}`),
      provenance: 'calculated',
    }
  }

  if (matches(question, 'evidence') && matches(question, 'recommendation')) {
    const latest = ctx.recommendations[0]
    if (!latest) return { answer: 'There are no recommendations currently on record to provide evidence for.', evidence: [], provenance: 'calculated' }
    return {
      answer: `Recommendation "${latest.title}" (${latest.id}) is supported by: ${latest.evidence.map((e) => `${e.label}: ${e.value}`).join('; ')}. Safety validation verdict: ${latest.safetyValidation.verdict.toUpperCase()}.`,
      evidence: latest.evidence.map((e) => e.sourceSystem),
      provenance: 'calculated',
    }
  }

  if (correlated.length > 0 && matches(question, 'alarm')) {
    return {
      answer: `${ctx.rawAlarms.filter((a) => a.active).length} raw alarm(s) are currently active, correlated into ${correlated.length} probable operational event(s). Primary: ${correlated[0]?.title}. ${correlated[0]?.probableCommonCause}`,
      evidence: ['Alarm correlation engine'],
      provenance: 'calculated',
    }
  }

  return {
    answer: `Current operating picture: mode ${OPERATIONAL_MODE_LABELS[ctx.snapshot.operationalMode]}, overall vessel health ${ctx.snapshot.overallHealth.toUpperCase()}, ${awaiting.length} recommendation(s) awaiting decision, ${uncorrelatedCount + correlated.length} alarm condition(s) tracked. Ask about machinery, navigation, fuel, communications, shore support or a specific recommendation for more detail.`,
    evidence: ['Vessel Digital Twin'],
    provenance: 'calculated',
  }
}

/** Offline/prototype implementation. Fully deterministic, derives every answer from current
 * simulation state, and never calls an external network service. */
export const deterministicCopilotAdapter: CopilotAdapter = {
  kind: 'deterministic',
  ask: deterministicAsk,
}

/** Connected POC implementation. Attempts a real generative-AI/RAG backend call; on any failure
 * (expected for the public static demonstration, which has no backend deployed) it falls back to
 * the deterministic adapter and the response is still labelled by its true provenance. */
export const connectedAICopilotAdapter: CopilotAdapter = {
  kind: 'connected_ai',
  ask: async (question, ctx) => {
    const result = await attemptConnectedCall<{ answer: string; evidence: string[] }>(CONNECTED_API_ENDPOINTS.copilot, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, operationalMode: ctx.snapshot.operationalMode, overallHealth: ctx.snapshot.overallHealth }),
    })
    if (result.ok && result.data) {
      return { answer: result.data.answer, evidence: result.data.evidence, provenance: 'ai_generated' }
    }
    const fallback = await deterministicAsk(question, ctx)
    return { ...fallback, answer: `[Connected AI service unavailable — showing offline analysis] ${fallback.answer}` }
  },
}

export function resolveCopilotAdapter(mode: 'offline' | 'connected'): CopilotAdapter {
  return mode === 'connected' ? connectedAICopilotAdapter : deterministicCopilotAdapter
}
