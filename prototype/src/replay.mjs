/**
 * Experimental reader for already-parsed, recorded DSH settlement events.
 * It does NOT recover withheld provider text, read compressed files, execute
 * tools, validate the full Core grammar, or certify model/task health.
 */
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const index = value => Number.isSafeInteger(value) && value >= 0
const FINISH = new Set(['stop', 'tool-calls', 'max-tokens', 'aborted', 'error'])
const CONTENT = new Set(['text', 'reasoning', 'tool-call', 'image', 'file'])
// Fresh attempt state is required across separate replay invocations too.
// Weak references reject reuse without retaining discarded policy objects.
const USED_POLICIES = new WeakSet()

function validChunk(chunk) {
  if (!object(chunk)) return false
  if (chunk.type === 'finish') {
    if (!object(chunk.reason) || !FINISH.has(chunk.reason.kind)) return false
    return !['error', 'aborted'].includes(chunk.reason.kind)
      || (object(chunk.reason.failure) && typeof chunk.reason.failure.code === 'string' && chunk.reason.failure.code.length > 0
        && typeof chunk.reason.failure.message === 'string' && chunk.reason.failure.message.length > 0)
  }
  if (chunk.type === 'usage') return object(chunk.usage)
  if (!index(chunk.index)) return false
  if (chunk.type === 'reasoning-delta' || chunk.type === 'text-delta') return typeof chunk.text === 'string'
  if (chunk.type === 'tool-call-delta') return typeof chunk.id === 'string'
    && typeof chunk.argumentsDelta === 'string' && (chunk.name === undefined || typeof chunk.name === 'string')
  if (chunk.type === 'block-start') return CONTENT.has(chunk.blockType)
  if (chunk.type === 'block-end') {
    if (!object(chunk.block) || !CONTENT.has(chunk.block.type)) return false
    if (chunk.block.type === 'reasoning' || chunk.block.type === 'text') return typeof chunk.block.text === 'string'
    if (chunk.block.type === 'tool-call') return ['id', 'name', 'arguments'].every(key => typeof chunk.block[key] === 'string')
    return true
  }
  return false
}

function unpack(record) {
  if (!object(record)) return null
  if (record.type === 'chunk') return validChunk(record.chunk) ? [structuredClone(record.chunk)] : null
  if (!index(record.index)) return null
  let members
  if (record.type === 'reasoning-chunks' || record.type === 'text-chunks') members = record.texts
  else if (record.type === 'tool-call-chunks' && typeof record.id === 'string'
    && (record.name === undefined || typeof record.name === 'string')) members = record.args
  else return null
  // Fragment order must be preserved. Timing is checked for shape but not used
  // to claim wall-clock detection latency.
  if (!Array.isArray(members) || members.length === 0 || members.some(text => typeof text !== 'string')
    || !Array.isArray(record.dt) || record.dt.length !== members.length - 1
    || record.dt.some(gap => !Number.isSafeInteger(gap) || gap < 0)
    || !Number.isSafeInteger(record.time0) || record.time0 < 0) return null
  if (record.type === 'tool-call-chunks') return members.map(argumentsDelta => ({
    type: 'tool-call-delta', index: record.index, id: record.id,
    ...(record.name === undefined ? {} : { name: record.name }), argumentsDelta,
  }))
  return members.map(text => ({
    type: record.type === 'reasoning-chunks' ? 'reasoning-delta' : 'text-delta', index: record.index, text,
  }))
}

/** Each settlement event is one attempt; coordinates alone are NEVER grouping keys. */
export function readRecordedAttempts(events) {
  if (!Array.isArray(events)) throw new TypeError('events must be an array of parsed JSON events')
  const attempts = [], issues = [], ignoredTypes = new Map()
  let parsedEvents = 0
  for (const [row, event] of events.entries()) {
    if (!object(event) || typeof event.type !== 'string') {
      issues.push({ row, reason: 'malformed-event' }); continue
    }
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') {
      ignoredTypes.set(event.type, (ignoredTypes.get(event.type) ?? 0) + 1)
      if (/^assistant\/|chunk|delta|reasoning|stream|attempt/i.test(event.type)) {
        issues.push({ row, reason: 'unsupported-stream-event', type: event.type })
      }
      continue
    }
    const data = event.data
    if (!object(data) || !index(data.turn) || !index(data.step) || !Array.isArray(data.stream)) {
      issues.push({ row, reason: 'missing-stream-or-coordinates', type: event.type }); continue
    }
    parsedEvents++
    const chunks = [], problems = []
    for (const [recordIndex, record] of data.stream.entries()) {
      const unpacked = unpack(record)
      if (unpacked === null) problems.push({ recordIndex, reason: 'unknown-or-malformed-record' })
      else for (const chunk of unpacked) chunks.push(chunk)
    }
    const finishes = chunks.flatMap((chunk, at) => chunk.type === 'finish' ? [at] : [])
    if (finishes.length !== 1 || finishes[0] !== chunks.length - 1) problems.push({ reason: 'missing-or-nonterminal-finish' })
    if (problems.length > 0) issues.push({ row, reason: 'incomplete-attempt', problems })
    attempts.push({ key: `row:${row}`, eventType: event.type, turn: data.turn, step: data.step,
      chunks, complete: problems.length === 0, problems })
  }
  return {
    attempts,
    coverage: { inputEvents: events.length, parsedEvents, attempts: attempts.length,
      ignoredTypes: Object.fromEntries(ignoredTypes), issues,
      complete: attempts.length > 0 && issues.length === 0,
      inputBasis: 'recorded-accepted-stream-not-provider-raw',
      scope: 'assistant/message.data.stream and assistant/attempt.data.stream only' },
  }
}

/**
 * Evaluate every recorded chunk in order with a FRESH policy per attempt.
 * The caller supplies the real policy under evaluation; no copied detector,
 * final-tail-only shortcut or assumed mid-delta character offset is used.
 */
export function replayRecordedAttempts(report, createPolicy) {
  if (!object(report) || !Array.isArray(report.attempts) || !object(report.coverage)
    || typeof report.coverage.complete !== 'boolean' || typeof createPolicy !== 'function') {
    throw new TypeError('a reader report and a policy factory are required')
  }
  const results = report.attempts.map(attempt => {
    if (!attempt.complete) return { key: attempt.key, status: 'not-evaluated-incomplete' }
    const policy = createPolicy(Object.freeze({ key: attempt.key, turn: attempt.turn, step: attempt.step }))
    if (!object(policy) || typeof policy.push !== 'function' || typeof policy.flush !== 'function' || !('interruption' in policy)) {
      throw new TypeError('policy must implement push, flush and interruption')
    }
    if (USED_POLICIES.has(policy)) throw new Error('policy factory reused one attempt instance')
    USED_POLICIES.add(policy)
    if (policy.interruption !== undefined) throw new Error('policy factory returned a pre-interrupted instance')
    let interruption
    let acceptedReasoningCodeUnits = 0, consumedChunks = 0, triggerChunkIndex = null
    const accept = items => {
      if (!Array.isArray(items)) throw new TypeError('policy output must be an array')
      for (const item of items) {
        const control = object(item) && index(item.index) && (item.type === 'accepted-reasoning-end'
          || (item.type === 'reasoning-stall' && ['suspected', 'released', 'barrier'].includes(item.stage)))
        if (!control && !validChunk(item)) throw new TypeError('unknown or malformed accepted output item')
        if (item.type === 'reasoning-delta') {
          if (typeof item.text !== 'string') throw new TypeError('accepted reasoning must be text')
          acceptedReasoningCodeUnits += item.text.length
        }
      }
    }
    for (const [at, chunk] of attempt.chunks.entries()) {
      accept(policy.push(structuredClone(chunk)))
      consumedChunks++
      if (policy.interruption !== undefined) { interruption = structuredClone(policy.interruption); triggerChunkIndex = at; break }
    }
    accept(policy.flush())
    interruption ??= policy.interruption
    if (interruption !== undefined && (!object(interruption.failure) || typeof interruption.failure.code !== 'string')) {
      throw new TypeError('interruption must carry a failure code')
    }
    return { key: attempt.key, status: interruption === undefined ? 'no-interruption-on-recorded-input' : 'policy-interrupted',
      failureCode: interruption?.failure.code ?? null, triggerChunkIndex, consumedChunks,
      recordedChunks: attempt.chunks.length, acceptedReasoningCodeUnits,
      scope: 'accepted reasoning deltas only; not final-block, transport, billing or task-correctness verification' }
  })
  return { coverage: structuredClone(report.coverage), results }
}
