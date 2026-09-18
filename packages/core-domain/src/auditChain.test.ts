import { describe, expect, it } from 'vitest'
import type { AuditEvent } from '@/types'
import { AUDIT_CHAIN_GENESIS_HASH, INITIAL_AUDIT_CHAIN_CHECKPOINT, PENDING_HASH, canonicaliseAuditEvent, createAuditEvent, sealPending, verifyChain, type AuditChainCheckpoint } from './auditChain'

function baseFields(seq: number, overrides: Partial<Omit<AuditEvent, 'seq' | 'hash' | 'prevHash'>> = {}): Omit<AuditEvent, 'seq' | 'hash' | 'prevHash'> {
  return {
    id: `AUD-${String(seq).padStart(6, '0')}`,
    timestampIso: new Date(2026, 0, 1, 0, 0, seq).toISOString(),
    operatingMode: 'Open Sea',
    scenarioId: null,
    kind: 'simulation',
    event: `Synthetic event ${seq}`,
    ...overrides,
  }
}

/** Like `baseFields`, but including `seq` itself — for exercising `canonicaliseAuditEvent`
 * directly, which (unlike `createAuditEvent`) takes `seq` as part of the record, not separately. */
function baseFieldsWithSeq(seq: number, overrides: Partial<Omit<AuditEvent, 'hash' | 'prevHash'>> = {}): Omit<AuditEvent, 'hash' | 'prevHash'> {
  return { seq, ...baseFields(seq), ...overrides }
}

/** Builds and fully seals a chain of `count` events, seq 1..count, newest-first (matching
 * SimulationState.auditEvents' storage order). */
async function buildSealedChain(count: number, checkpoint: AuditChainCheckpoint = INITIAL_AUDIT_CHAIN_CHECKPOINT) {
  const pendingOldestFirst: AuditEvent[] = []
  for (let seq = 1; seq <= count; seq++) {
    pendingOldestFirst.push(createAuditEvent(seq, baseFields(seq)))
  }
  const { events, checkpoint: sealedCheckpoint } = await sealPending(pendingOldestFirst, checkpoint)
  // sealPending preserves input order; return newest-first as the store would hold it.
  return { eventsNewestFirst: [...events].reverse(), checkpoint: sealedCheckpoint }
}

describe('canonicaliseAuditEvent', () => {
  it('is deterministic regardless of the input object key order', () => {
    const a = { seq: 1, id: 'AUD-000001', timestampIso: 't', operatingMode: 'Open Sea', scenarioId: null, kind: 'simulation' as const, event: 'x' }
    const b = { event: 'x', kind: 'simulation' as const, scenarioId: null, operatingMode: 'Open Sea', timestampIso: 't', id: 'AUD-000001', seq: 1 }
    expect(canonicaliseAuditEvent(a)).toBe(canonicaliseAuditEvent(b))
  })

  it('serialises a missing optional field identically to an explicit undefined', () => {
    const withMissing = baseFieldsWithSeq(1)
    const withUndefined = { ...baseFieldsWithSeq(1), recommendationId: undefined, hazardId: undefined }
    expect(canonicaliseAuditEvent(withMissing)).toBe(canonicaliseAuditEvent(withUndefined))
  })

  it('produces different output when a real field value differs', () => {
    const one = canonicaliseAuditEvent(baseFieldsWithSeq(1, { event: 'A' }))
    const other = canonicaliseAuditEvent(baseFieldsWithSeq(1, { event: 'B' }))
    expect(one).not.toBe(other)
  })

  it('distinguishes an explicit outcome from a missing one', () => {
    const withOutcome = canonicaliseAuditEvent(baseFieldsWithSeq(1, { outcome: 'Normal' }))
    const withoutOutcome = canonicaliseAuditEvent(baseFieldsWithSeq(1))
    expect(withOutcome).not.toBe(withoutOutcome)
  })
})

describe('createAuditEvent', () => {
  it('starts PENDING (hash and prevHash both unset) regardless of seq', () => {
    const event = createAuditEvent(7, baseFields(7))
    expect(event.seq).toBe(7)
    expect(event.hash).toBe(PENDING_HASH)
    expect(event.prevHash).toBe(PENDING_HASH)
  })
})

describe('sealPending', () => {
  it('seals pending events in ascending seq order, chaining each hash from the previous', async () => {
    const pending = [createAuditEvent(1, baseFields(1)), createAuditEvent(2, baseFields(2)), createAuditEvent(3, baseFields(3))]
    const { events, checkpoint, sealedAny } = await sealPending(pending, INITIAL_AUDIT_CHAIN_CHECKPOINT)
    expect(sealedAny).toBe(true)
    expect(events.every((e) => e.hash !== PENDING_HASH)).toBe(true)
    expect(events[0]!.prevHash).toBe(AUDIT_CHAIN_GENESIS_HASH)
    expect(events[1]!.prevHash).toBe(events[0]!.hash)
    expect(events[2]!.prevHash).toBe(events[1]!.hash)
    expect(checkpoint.sealedThroughSeq).toBe(3)
    expect(checkpoint.sealedCount).toBe(3)
    expect(checkpoint.sealedPrefixHash).toBe(events[2]!.hash)
  })

  it('does nothing when there is nothing pending', async () => {
    const { sealedAny, checkpoint } = await sealPending([], INITIAL_AUDIT_CHAIN_CHECKPOINT)
    expect(sealedAny).toBe(false)
    expect(checkpoint).toEqual(INITIAL_AUDIT_CHAIN_CHECKPOINT)
  })

  it('resumes from a prior checkpoint rather than re-sealing from genesis', async () => {
    const first = await sealPending([createAuditEvent(1, baseFields(1)), createAuditEvent(2, baseFields(2))], INITIAL_AUDIT_CHAIN_CHECKPOINT)
    const combined = [...first.events, createAuditEvent(3, baseFields(3))]
    const second = await sealPending(combined, first.checkpoint)
    expect(second.checkpoint.sealedThroughSeq).toBe(3)
    expect(second.checkpoint.sealedCount).toBe(3)
    // seq 1 and 2 are untouched by the second pass — same hash as the first pass produced.
    const seq1 = second.events.find((e) => e.seq === 1)!
    expect(seq1.hash).toBe(first.events.find((e) => e.seq === 1)!.hash)
  })

  it('stops at a gap instead of skipping past a seq that is missing entirely', async () => {
    // seq 2 is absent — simulating an event evicted before the sealer ever reached it.
    const pending = [createAuditEvent(1, baseFields(1)), createAuditEvent(3, baseFields(3))]
    const { checkpoint, sealedAny } = await sealPending(pending, INITIAL_AUDIT_CHAIN_CHECKPOINT)
    expect(sealedAny).toBe(true)
    expect(checkpoint.sealedThroughSeq).toBe(1) // stopped before seq 3, since seq 2 is missing
  })
})

describe('verifyChain — the acceptance test that defines this package', () => {
  it('(a) MUTATE a field in a mid-chain record -> invalid at that seq', async () => {
    const { eventsNewestFirst, checkpoint } = await buildSealedChain(10)
    const tampered = eventsNewestFirst.map((e) => (e.seq === 5 ? { ...e, event: 'TAMPERED CONTENT' } : e))
    const result = await verifyChain(tampered, checkpoint, 0)
    expect(result.valid).toBe(false)
    expect(result.firstBrokenSeq).toBe(5)
  })

  it('(b) DELETE a mid-chain record -> invalid at the following seq', async () => {
    const { eventsNewestFirst, checkpoint } = await buildSealedChain(10)
    const withoutSeq5 = eventsNewestFirst.filter((e) => e.seq !== 5)
    const result = await verifyChain(withoutSeq5, checkpoint, 0)
    expect(result.valid).toBe(false)
    // seq 5 is gone, so seq 6's prevHash no longer matches seq 4's hash — the break is detected
    // at seq 6, the record immediately following the deleted one.
    expect(result.firstBrokenSeq).toBe(6)
  })

  it('(c) REORDER two adjacent records -> invalid', async () => {
    const { eventsNewestFirst, checkpoint } = await buildSealedChain(10)
    // Newest-first storage: seq 6 sits before seq 5 in the array. Swap them (seq 5 and seq 6
    // keep their own seq/hash/prevHash — this is a pure storage-position swap).
    const idx5 = eventsNewestFirst.findIndex((e) => e.seq === 5)
    const idx6 = eventsNewestFirst.findIndex((e) => e.seq === 6)
    const reordered = [...eventsNewestFirst]
    ;[reordered[idx5], reordered[idx6]] = [reordered[idx6]!, reordered[idx5]!]
    const result = await verifyChain(reordered, checkpoint, 0)
    expect(result.valid).toBe(false)
  })

  it('(d) APPEND a forged record with a plausible prevHash but wrong content hash -> invalid', async () => {
    const { eventsNewestFirst, checkpoint } = await buildSealedChain(10)
    const trueHead = eventsNewestFirst[0]! // newest-first: index 0 is seq 10
    const forged: AuditEvent = {
      ...createAuditEvent(11, baseFields(11, { event: 'Forged record' })),
      prevHash: trueHead.hash, // plausible — correctly points at the real seq 10 hash
      hash: 'f'.repeat(64), // but the hash itself was not honestly computed
    }
    const withForgery = [forged, ...eventsNewestFirst]
    const result = await verifyChain(withForgery, checkpoint, 0)
    expect(result.valid).toBe(false)
    expect(result.firstBrokenSeq).toBe(11)
  })

  // (d) above uses a lazily-forged hash ('f'.repeat(64)) that was never honestly computed. The
  // three tests below are the harder case a safety review found missing: a tamperer who correctly
  // recomputes every hash they touch, using the exact same `canonicaliseAuditEvent`/SHA-256 this
  // module uses. Such a forgery is, by construction, internally self-consistent — every record's
  // own hash matches its own content and every `prevHash` matches the previous record's `hash` —
  // so it is invisible to the per-record loop. Only comparing the newest sealed record against
  // `checkpoint.sealedThroughSeq`/`sealedPrefixHash` (the anchor written by the real sealer, never
  // touched by these attacks) catches it. Without that comparison, these all reported "valid".

  it('(d2) MUTATE a mid-chain record AND honestly re-hash every record after it forward -> invalid', async () => {
    const trueOriginal = await buildSealedChain(10)
    const trueThroughSeq4 = await buildSealedChain(4) // deterministic — same content/hashes as seq 1-4 of the chain above
    const mutatedTailOldestFirst = [5, 6, 7, 8, 9, 10].map((seq) => createAuditEvent(seq, baseFields(seq, seq === 5 ? { event: 'TAMPERED CONTENT' } : {})))
    const { events: resealedTail } = await sealPending(mutatedTailOldestFirst, trueThroughSeq4.checkpoint)
    const tamperedNewestFirst = [...resealedTail].reverse().concat(trueOriginal.eventsNewestFirst.filter((e) => e.seq <= 4))

    // The forged tail is internally consistent by construction — confirm the per-record chaining
    // alone would not have caught it, so this test is actually exercising the checkpoint anchor.
    for (let i = 1; i < resealedTail.length; i++) expect(resealedTail[i]!.prevHash).toBe(resealedTail[i - 1]!.hash)

    const result = await verifyChain(tamperedNewestFirst, trueOriginal.checkpoint, 0) // the REAL checkpoint, untouched by the attack
    expect(result.valid).toBe(false)
    expect(result.firstBrokenSeq).toBe(10)
  })

  it('(d3) REWRITE the newest sealed record in place and honestly recompute its own hash -> invalid', async () => {
    const trueOriginal = await buildSealedChain(10)
    const trueThroughSeq9 = await buildSealedChain(9) // deterministic — same content/hashes as seq 1-9 above
    const { events: resealedSeq10 } = await sealPending([createAuditEvent(10, baseFields(10, { event: 'TAMPERED SEQ10 CONTENT' }))], trueThroughSeq9.checkpoint)
    const tamperedNewestFirst = [resealedSeq10[0]!, ...trueOriginal.eventsNewestFirst.filter((e) => e.seq !== 10)]

    const result = await verifyChain(tamperedNewestFirst, trueOriginal.checkpoint, 0) // the REAL checkpoint, untouched by the attack
    expect(result.valid).toBe(false)
    expect(result.firstBrokenSeq).toBe(10)
  })

  it('(d4) APPEND a forged record with an honestly-computed hash beyond the checkpoint -> invalid', async () => {
    const { eventsNewestFirst, checkpoint } = await buildSealedChain(10)
    const { events: honestlySealedForgery } = await sealPending([createAuditEvent(11, baseFields(11, { event: 'Honestly-hashed forged record' }))], checkpoint)
    const withForgery = [honestlySealedForgery[0]!, ...eventsNewestFirst]
    const result = await verifyChain(withForgery, checkpoint, 0) // the REAL checkpoint says sealing stopped at seq 10
    expect(result.valid).toBe(false)
    expect(result.firstBrokenSeq).toBe(11)
  })

  it('(e) an untampered chain of 50 records -> valid', async () => {
    const { eventsNewestFirst, checkpoint } = await buildSealedChain(50)
    const result = await verifyChain(eventsNewestFirst, checkpoint, 0)
    expect(result.valid).toBe(true)
    expect(result.firstBrokenSeq).toBeNull()
  })

  it('(f) a chain past the retention boundary (oldest evicted, sealed prefix carried) -> STILL VALID', async () => {
    // Sealing/verifying 2500 real SHA-256 digests sequentially (each depends on the previous
    // hash, so this cannot be parallelised — see sealPending/verifyChain) is inherently slower
    // than the default 5s test timeout under parallel test-project contention.
    const MAX_AUDIT_EVENTS = 2000
    const TOTAL = MAX_AUDIT_EVENTS + 500 // comfortably past one full eviction cycle

    // Seal the whole thing first (as the incremental sealer would, well ahead of any eviction —
    // see docs/assumptions.md on why sealing is expected to keep pace).
    const { eventsNewestFirst: fullyBuilt, checkpoint: fullCheckpoint } = await buildSealedChain(TOTAL)

    // Now simulate exactly what engine.ts's truncation does: newest-first, keep only the first
    // MAX_AUDIT_EVENTS (i.e. drop the oldest — genesis-adjacent — tail) — AND declare the
    // eviction boundary that truncation just legitimately advanced past, exactly as engine.ts's
    // own `evictedThroughSeq` counter would. A bare slice() with no declared boundary is exactly
    // what let arbitrary oldest-end deletion masquerade as this same "still valid" case — see
    // `evictedThroughSeq` on `verifyChain` / `SimulationState`.
    const truncated = fullyBuilt.slice(0, MAX_AUDIT_EVENTS)
    const evictedThroughSeq = TOTAL - MAX_AUDIT_EVENTS
    expect(truncated.length).toBe(MAX_AUDIT_EVENTS)
    expect(truncated.some((e) => e.seq === 1)).toBe(false) // genesis really is gone

    const result = await verifyChain(truncated, fullCheckpoint, evictedThroughSeq)
    expect(result.valid).toBe(true)
    expect(result.firstBrokenSeq).toBeNull()

    // Without (f) this package would break silently at event 2001 — assert the oldest surviving
    // record really is past the boundary, not coincidentally still seq 1.
    const oldestSurviving = truncated[truncated.length - 1]!
    expect(oldestSurviving.seq).toBe(TOTAL - MAX_AUDIT_EVENTS + 1)
  }, 60_000)

  it('(g) TRUNCATE the newest sealed records (tail deletion) -> invalid, not silently "nothing to check"', async () => {
    // Eviction only ever drops the OLDEST end (constraint 1) — the newest visible sealed record's
    // seq must always equal the checkpoint's sealedThroughSeq. Deleting from the NEWEST end (the
    // opposite direction to legitimate eviction) must be caught, not waved through because the
    // remaining records are individually self-consistent.
    const { eventsNewestFirst, checkpoint } = await buildSealedChain(10)
    const withoutNewestTwo = eventsNewestFirst.filter((e) => e.seq !== 9 && e.seq !== 10)
    const result = await verifyChain(withoutNewestTwo, checkpoint, 0)
    expect(result.valid).toBe(false)
    expect(result.firstBrokenSeq).toBe(checkpoint.sealedThroughSeq)
  })

  it('(h) DELETE every sealed record -> invalid, not "nothing sealed, therefore valid"', async () => {
    const { checkpoint } = await buildSealedChain(10)
    const result = await verifyChain([], checkpoint, 0) // checkpoint still claims 10 were sealed
    expect(result.valid).toBe(false)
    expect(result.firstBrokenSeq).toBe(checkpoint.sealedThroughSeq)
  })

  // (g) and (h) above cover the NEWEST end (tail truncation, full deletion). The two tests below
  // are the symmetric gap a safety review found at the OLDEST end: before `evictedThroughSeq`
  // existed, `checkpoint.sealedCount` was the only oldest-end anchor, and it cannot tell
  // "genesis was legitimately evicted under the retention boundary" apart from "genesis (or any
  // number of the oldest records) was simply deleted" — because `sealedCount === sealedThroughSeq`
  // always (an invariant of `sealPending`), so checking it is really just re-checking
  // gap-freeness, which the per-record loop already guarantees. These reproduce exactly that:
  // `MAX_AUDIT_EVENTS` is never reached (nothing COULD have been legitimately evicted), the
  // checkpoint is left completely untouched, and yet the oldest records are simply gone.

  it('(i) DELETE the oldest records, including genesis, with no eviction ever having occurred -> invalid', async () => {
    const { eventsNewestFirst, checkpoint } = await buildSealedChain(10)
    const withoutOldestFour = eventsNewestFirst.filter((e) => e.seq > 4) // seq 1-4 (incl. genesis) gone
    const result = await verifyChain(withoutOldestFour, checkpoint, 0) // evictedThroughSeq: nothing was ever evicted
    expect(result.valid).toBe(false)
    expect(result.firstBrokenSeq).toBe(5)
  })

  it('(j) DELETE all but the newest oldest-end record, with no eviction ever having occurred -> invalid', async () => {
    const { eventsNewestFirst, checkpoint } = await buildSealedChain(10)
    const onlyNewest = eventsNewestFirst.filter((e) => e.seq === 10)
    const result = await verifyChain(onlyNewest, checkpoint, 0)
    expect(result.valid).toBe(false)
    expect(result.firstBrokenSeq).toBe(10)
  })

  it('an empty chain (nothing sealed yet) is trivially valid', async () => {
    const result = await verifyChain([], INITIAL_AUDIT_CHAIN_CHECKPOINT, 0)
    expect(result.valid).toBe(true)
  })

  it('pending (unsealed) records at the head do not count as broken', async () => {
    const { eventsNewestFirst, checkpoint } = await buildSealedChain(5)
    const withPending = [createAuditEvent(6, baseFields(6)), ...eventsNewestFirst]
    const result = await verifyChain(withPending, checkpoint, 0)
    expect(result.valid).toBe(true)
  })
})
