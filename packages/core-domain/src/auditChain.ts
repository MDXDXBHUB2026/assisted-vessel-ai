import type { AuditEvent } from '@/types'

/**
 * Hash-chained, tamper-EVIDENT audit trail. Read this file top to bottom before touching the
 * audit trail anywhere else — it is the single source of truth for how records are sequenced,
 * hashed and verified. See docs/assumptions.md for the three constraints this design exists to
 * satisfy (the buffer is newest-first and lossy; hashing is async and the tick is not; there are
 * two producers) and for what this deliberately does NOT claim (no signing, no non-repudiation —
 * that is Phase 2C).
 */

/**
 * Sentinel for an audit event's `hash`/`prevHash` before the incremental sealer has processed it.
 * Deliberately distinct from `AUDIT_CHAIN_GENESIS_HASH` (below) — "not yet sealed" and "sealed as
 * the very first record" must never be confused with each other.
 */
export const PENDING_HASH = ''

/**
 * The `prevHash` the very first audit event in a session's chain (seq 1) must carry once sealed.
 * A fixed, documented constant rather than an empty string, so "genesis" and "pending" are never
 * the same value — see `PENDING_HASH`. 64 hex characters, matching a real SHA-256 digest's
 * length, so a genesis-linked record is visually indistinguishable in shape from any other.
 */
export const AUDIT_CHAIN_GENESIS_HASH = '0'.repeat(64)

/**
 * The single place a new audit event is constructed, used by BOTH producers (the engine tick,
 * and every simulationStore action) — see docs/assumptions.md constraint 3. `seq` is the only
 * true ordering key over the audit trail; callers allocate it from one persisted counter
 * (`SimulationState.nextAuditSeq`) before calling this. `hash`/`prevHash` start PENDING: hashing
 * is asynchronous (crypto.subtle) and deliberately does not happen here, inside what is (for the
 * engine) a synchronous tick — see `sealPending` below.
 */
export function createAuditEvent(seq: number, fields: Omit<AuditEvent, 'seq' | 'hash' | 'prevHash'>): AuditEvent {
  return { ...fields, seq, hash: PENDING_HASH, prevHash: PENDING_HASH }
}

/**
 * Deterministic serialisation of an audit event's content, EXCLUDING `hash` and `prevHash`
 * themselves — hashing a field that is part of the hash's own definition is circular, and is the
 * mistake everyone makes once. Every field is listed explicitly, in a fixed order, with every
 * optional field coalesced to `null` — so a field that is `undefined` and a field that is simply
 * absent from the object serialise identically, and the result never depends on the input
 * object's own (unspecified) key insertion order. If two runs of the same logical event can ever
 * produce different bytes here, the entire chain is worthless — hence this function has its own
 * dedicated tests (auditChain.test.ts) independent of the chain logic that calls it.
 */
export function canonicaliseAuditEvent(event: Omit<AuditEvent, 'hash' | 'prevHash'>): string {
  // Typed as a `Record` over every key of the input type (bar hash/prevHash, already excluded)
  // rather than inferred from the literal: if a field is ever added to `AuditEvent`, omitting it
  // here becomes a COMPILE ERROR (a missing Record key) instead of silently hashing incomplete
  // content — content that looks audited but is actually free to mutate undetected.
  const canonical: Record<keyof Omit<AuditEvent, 'hash' | 'prevHash'>, string | number | boolean | null> = {
    seq: event.seq,
    id: event.id,
    timestampIso: event.timestampIso,
    operatingMode: event.operatingMode,
    scenarioId: event.scenarioId ?? null,
    kind: event.kind,
    event: event.event,
    recommendationId: event.recommendationId ?? null,
    modelOrRuleId: event.modelOrRuleId ?? null,
    confidencePercent: event.confidencePercent ?? null,
    safetyValidationResult: event.safetyValidationResult ?? null,
    humanDecision: event.humanDecision ?? null,
    decisionComment: event.decisionComment ?? null,
    responsibleRole: event.responsibleRole ?? null,
    outcome: event.outcome ?? null,
    hazardId: event.hazardId ?? null,
  }
  return JSON.stringify(canonical)
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * The carried-forward summary of everything the incremental sealer has ever sealed, INCLUDING
 * records since evicted from the live `auditEvents` buffer (constraint 1: that buffer is
 * newest-first and capped at MAX_AUDIT_EVENTS, so truncation drops the oldest — genesis-adjacent
 * — end first). `sealedThroughSeq`/`sealedPrefixHash` are the sealer's own resume point (what
 * `prevHash` the next pending record should chain from); `sealedCount` is the retention-boundary
 * figure the UI shows ("N events sealed" even though far fewer may still be visible).
 */
export interface AuditChainCheckpoint {
  sealedThroughSeq: number
  sealedPrefixHash: string
  sealedCount: number
}

export const INITIAL_AUDIT_CHAIN_CHECKPOINT: AuditChainCheckpoint = {
  sealedThroughSeq: 0,
  sealedPrefixHash: AUDIT_CHAIN_GENESIS_HASH,
  sealedCount: 0,
}

export interface SealResult {
  events: AuditEvent[]
  checkpoint: AuditChainCheckpoint
  sealedAny: boolean
}

/**
 * The incremental sealer. Consumes whatever of `events` is still PENDING (`hash === PENDING_HASH`)
 * in ascending `seq` order starting just after `checkpoint.sealedThroughSeq`, computing each
 * one's hash with crypto.subtle — genuinely async, and deliberately called from OUTSIDE the
 * simulation tick (see docs/assumptions.md constraint 2), never from it.
 *
 * If the next expected seq is not present in `events` at all, sealing stops there rather than
 * skipping ahead: that seq was evicted from the live buffer before the sealer ever reached it
 * (only possible if sealing falls far enough behind eviction — see docs/assumptions.md for why
 * this is not expected in practice, and is treated as a hard stop rather than silently ignored
 * when it happens anyway).
 */
export async function sealPending(events: readonly AuditEvent[], checkpoint: AuditChainCheckpoint): Promise<SealResult> {
  const pendingAscending = events.filter((event) => event.seq > checkpoint.sealedThroughSeq && event.hash === PENDING_HASH).sort((a, b) => a.seq - b.seq)

  if (pendingAscending.length === 0) {
    return { events: events as AuditEvent[], checkpoint, sealedAny: false }
  }

  let prevHash = checkpoint.sealedPrefixHash
  let sealedThroughSeq = checkpoint.sealedThroughSeq
  let sealedCount = checkpoint.sealedCount
  const sealedBySeq = new Map<number, AuditEvent>()

  for (const event of pendingAscending) {
    if (event.seq !== sealedThroughSeq + 1) break // gap — see function comment
    // eslint-disable-next-line no-await-in-loop -- each hash depends on the previous one; this
    // cannot be parallelised without breaking the chain it is trying to build.
    const hash = await sha256Hex(canonicaliseAuditEvent(event) + prevHash)
    sealedBySeq.set(event.seq, { ...event, prevHash, hash })
    prevHash = hash
    sealedThroughSeq = event.seq
    sealedCount += 1
  }

  if (sealedBySeq.size === 0) {
    return { events: events as AuditEvent[], checkpoint, sealedAny: false }
  }

  const sealedEvents = events.map((event) => sealedBySeq.get(event.seq) ?? event)
  return {
    events: sealedEvents,
    checkpoint: { sealedThroughSeq, sealedPrefixHash: prevHash, sealedCount },
    sealedAny: true,
  }
}

export interface ChainVerification {
  valid: boolean
  firstBrokenSeq: number | null
  reason: string | null
}

/**
 * Verifies the SEALED portion of the audit trail. `eventsNewestFirst` is expected in the same
 * order the store holds it in (newest first, matching `SimulationState.auditEvents`); pending
 * records (not yet sealed — see `sealPending`) are excluded from verification entirely, since
 * "not sealed yet" is not a violation, and the caller is expected to show pending/sealed counts
 * separately rather than folding them into this result.
 *
 * Deliberately does NOT sort the chronological (oldest-first) sequence by `seq` before walking
 * it — a REORDER attack (two adjacent records swapped in storage, each keeping its own original
 * seq/hash/prevHash) would be invisible to a verifier that silently re-sorts back into the
 * correct order first. Walking records in the order actually given, and requiring strictly
 * ascending, gap-free `seq`, is what makes reordering (and deletion) detectable at all.
 *
 * The oldest sealed record present is anchored by `evictedThroughSeq` — the highest `seq` the
 * engine's OWN `MAX_AUDIT_EVENTS` truncation has ever legitimately evicted (0 if never), advanced
 * only from that one place (see `SimulationState.evictedThroughSeq`). The oldest VISIBLE sealed
 * record's `seq` must equal `evictedThroughSeq + 1` exactly. Without this check, "genesis was
 * legitimately evicted under the retention boundary" and "genesis (or any other oldest-end
 * prefix) was simply deleted" were indistinguishable — including in a session where
 * `MAX_AUDIT_EVENTS` was never reached and no eviction could legitimately have happened at all. If
 * nothing has ever been evicted (`evictedThroughSeq === 0`), the oldest visible record's `seq`
 * must be 1 AND its `prevHash` must be `AUDIT_CHAIN_GENESIS_HASH`. What remains a disclosed,
 * bounded limitation once eviction HAS legitimately happened (see docs/assumptions.md): the
 * evicted content is gone, so the oldest surviving record's own `prevHash` cannot be independently
 * re-derived and is accepted as given — without an externally anchored checkpoint (Phase 2C
 * signing), a forgery that is self-consistent from that point forward cannot be distinguished from
 * the genuine article. `checkpoint.sealedCount` is also cross-checked against the visible sealed
 * range, as defence-in-depth against a hand-edited checkpoint — it is not independently
 * load-bearing the way `evictedThroughSeq` is (`sealedCount === sealedThroughSeq` always, as an
 * invariant of `sealPending`, so this reduces to the gap-freeness the per-record loop already
 * guarantees), but costs nothing to keep.
 *
 * The checkpoint is ALSO the anchor at the NEWEST end, and this is not optional: the newest
 * visible sealed record's `seq` AND `hash` must both equal `checkpoint.sealedThroughSeq` /
 * `checkpoint.sealedPrefixHash` exactly. This is the check that catches a tamperer who mutates a
 * record and then honestly re-hashes every record after it forward to stay internally
 * self-consistent (or who rewrites the newest sealed record in place and recomputes its own
 * hash, or who appends a forged record with a correctly, honestly computed hash) — such a
 * forgery passes every per-record check below unchanged (each record's stored hash matches its
 * own recomputed content, every `prevHash` matches the previous record's `hash`), because a
 * consistent re-hash is by definition locally consistent. The checkpoint, produced by the real
 * sealer and never touched by the per-record loop, is the only thing left that still disagrees —
 * so this comparison MUST run, and is not redundant with the per-record loop. Deleting sealed
 * records from the newest end (tail truncation), or deleting the entire sealed prefix, is also
 * caught here rather than falling through as "nothing to verify, therefore valid".
 */
export async function verifyChain(eventsNewestFirst: readonly AuditEvent[], checkpoint: AuditChainCheckpoint, evictedThroughSeq: number): Promise<ChainVerification> {
  const chronological = [...eventsNewestFirst].reverse()
  const sealed = chronological.filter((event) => event.hash !== PENDING_HASH)

  if (sealed.length === 0) {
    // Nothing visible is a violation in its own right if the checkpoint claims otherwise — the
    // entire sealed prefix would have to have been deleted for that to happen honestly.
    if (checkpoint.sealedCount > 0) {
      return {
        valid: false,
        firstBrokenSeq: checkpoint.sealedThroughSeq,
        reason: `the checkpoint records ${checkpoint.sealedCount} sealed event(s) through seq ${checkpoint.sealedThroughSeq}, but none are visible — the entire sealed prefix appears to have been deleted`,
      }
    }
    return { valid: true, firstBrokenSeq: null, reason: null }
  }

  // Eviction only ever drops the OLDEST end (constraint 1) — it can never remove, extend past, or
  // alter the newest sealed record without the sealer's own checkpoint changing to match it. See
  // the function comment above: this pair of checks (seq, then hash) is what defeats a tamperer
  // who re-hashes forward to stay locally consistent — the per-record loop below cannot.
  const last = sealed[sealed.length - 1]!
  if (last.seq > checkpoint.sealedThroughSeq) {
    return {
      valid: false,
      firstBrokenSeq: checkpoint.sealedThroughSeq + 1,
      reason: `a sealed record exists at seq ${checkpoint.sealedThroughSeq + 1}, but the sealed-prefix checkpoint says sealing only ever reached seq ${checkpoint.sealedThroughSeq} — an unauthorised (forged) append`,
    }
  }
  if (last.seq < checkpoint.sealedThroughSeq) {
    return {
      valid: false,
      firstBrokenSeq: checkpoint.sealedThroughSeq,
      reason: `the checkpoint says sealing reached seq ${checkpoint.sealedThroughSeq}, but the newest visible sealed record is seq ${last.seq} — the newest sealed record(s) appear to have been deleted`,
    }
  }
  if (last.hash !== checkpoint.sealedPrefixHash) {
    return {
      valid: false,
      firstBrokenSeq: last.seq,
      reason: `the newest sealed record (seq ${last.seq}) does not match the hash recorded by the sealed-prefix checkpoint — its content, or an earlier record's content re-hashed forward to stay self-consistent, was altered after sealing`,
    }
  }

  // The count/genesis checks below assume a gap-free visible range (they are eviction-history
  // sanity checks, not tamper localisers) — deliberately run AFTER the per-record loop, which
  // finds and precisely reports a mid-chain deletion or reorder (a gap) before these get a
  // chance to fire and report a far less specific seq (see the regression this order fixes:
  // deleting a mid-chain record shrinks `sealed.length` exactly like an eviction would, so
  // checking count-consistency first mis-blamed the CHAIN'S START instead of the actual gap).
  for (let i = 0; i < sealed.length; i++) {
    const record = sealed[i]!

    if (i > 0) {
      const previous = sealed[i - 1]!
      if (record.seq !== previous.seq + 1) {
        return { valid: false, firstBrokenSeq: record.seq, reason: `record at seq ${previous.seq + 1} is missing — the following record (seq ${record.seq}) no longer chains from the true previous hash` }
      }
      if (record.prevHash !== previous.hash) {
        return { valid: false, firstBrokenSeq: record.seq, reason: `prevHash at seq ${record.seq} does not match the hash of seq ${previous.seq}` }
      }
    }

    // eslint-disable-next-line no-await-in-loop -- verification order matters no less than
    // sealing order; this is a diagnostic path, not a hot one.
    const recomputedHash = await sha256Hex(canonicaliseAuditEvent(record) + record.prevHash)
    if (recomputedHash !== record.hash) {
      return { valid: false, firstBrokenSeq: record.seq, reason: `hash at seq ${record.seq} does not match its recomputed content — the record was altered` }
    }
  }

  // Reached only once every visible record is confirmed gap-free and individually consistent —
  // `sealed.length` now genuinely equals the visible range's size, so this is a safe final check
  // of the eviction history itself: does the checkpoint's own "N ever sealed" tally agree with
  // how many are visible plus how many the disclosed retention boundary says were evicted?
  const first = sealed[0]!
  const expectedSealedCount = first.seq - 1 + sealed.length
  if (checkpoint.sealedCount !== expectedSealedCount) {
    return {
      valid: false,
      firstBrokenSeq: first.seq,
      reason: `sealed-prefix checkpoint (${checkpoint.sealedCount} ever sealed) is inconsistent with the visible sealed range starting at seq ${first.seq} (expected ${expectedSealedCount})`,
    }
  }
  const expectedFirstSeq = evictedThroughSeq + 1
  if (first.seq !== expectedFirstSeq) {
    return {
      valid: false,
      firstBrokenSeq: first.seq,
      reason:
        evictedThroughSeq === 0
          ? `the oldest visible sealed record is seq ${first.seq}, but nothing has ever been legitimately evicted — the true first record (seq 1) appears to have been deleted`
          : `the oldest visible sealed record is seq ${first.seq}, but the engine's own eviction history says records were only ever legitimately dropped through seq ${evictedThroughSeq} — the true oldest surviving record (seq ${expectedFirstSeq}) appears to have been deleted`,
    }
  }
  if (evictedThroughSeq === 0 && first.prevHash !== AUDIT_CHAIN_GENESIS_HASH) {
    return { valid: false, firstBrokenSeq: first.seq, reason: 'the first record does not chain from the genesis hash' }
  }

  return { valid: true, firstBrokenSeq: null, reason: null }
}
