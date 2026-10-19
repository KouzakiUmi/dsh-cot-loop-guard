import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readRecordedAttempts, replayRecordedAttempts } from '../src/replay.mjs'

const raw = chunk => ({ type: 'chunk', time: 0, chunk })
const delta = text => raw({ type: 'reasoning-delta', index: 0, text })
const finish = () => raw({ type: 'finish', reason: { kind: 'stop' } })
const event = (stream, type = 'assistant/message', patch = {}) => ({
  type, data: { turn: 1, step: 1, stream, ...patch },
})
const run = texts => ({ type: 'reasoning-chunks', index: 0, time0: 0,
  dt: Array(Math.max(0, texts.length - 1)).fill(1), texts })
class Pass {
  interruption = undefined
  push(chunk) { return [chunk] }
  flush() { return [] }
}

// A tiny synthetic policy exercises the driver. It is NOT the shipping detector
// and its results are not an accuracy evaluation of either guard implementation.
class WithholdingFixture {
  interruption = undefined
  pending = ''
  push(chunk) {
    if (chunk.type !== 'reasoning-delta') return [...this.flush(), chunk]
    if (chunk.text === 'safe ') return [chunk]
    this.pending += chunk.text
    if (this.pending.includes('LOOP LOOP LOOP')) {
      this.pending = ''
      this.interruption = { failure: { code: 'FIXTURE_LOOP' } }
    }
    return []
  }
  flush() {
    if (this.interruption !== undefined || this.pending === '') return []
    const text = this.pending
    this.pending = ''
    return [{ type: 'reasoning-delta', index: 0, text }]
  }
}

test('reads assistant/message.stream as well as assistant/attempt.stream', () => {
  const report = readRecordedAttempts([
    event([delta('one'), finish()]), event([delta('two'), finish()], 'assistant/attempt'),
  ])
  assert.equal(report.coverage.complete, true)
  assert.equal(report.attempts.length, 2)
  assert.equal(report.attempts[0].eventType, 'assistant/message')
  assert.equal(report.attempts[1].eventType, 'assistant/attempt')
})

test('same turn and step never merge separate attempts or leak detector state', () => {
  const report = readRecordedAttempts([event([delta('one'), finish()]), event([delta('two'), finish()])])
  let created = 0
  const replay = replayRecordedAttempts(report, () => { created++; return new Pass() })
  assert.equal(created, 2)
  assert.deepEqual(replay.results.map(result => result.acceptedReasoningCodeUnits), [3, 3])
  assert.notEqual(replay.results[0].key, replay.results[1].key)
})

test('packed delta fragments retain their original order and boundaries', () => {
  const report = readRecordedAttempts([event([run(['a', 'bc', 'd']), finish()])])
  assert.deepEqual(report.attempts[0].chunks.slice(0, 3).map(chunk => chunk.text), ['a', 'bc', 'd'])
  assert.equal(report.coverage.complete, true)
})

test('intermediate repetition is evaluated even if the final tail is normal', () => {
  const report = readRecordedAttempts([event([
    delta('safe '), run(['LOOP ', 'LOOP ', 'LOOP']), delta('a normal final tail.'), finish(),
  ])])
  const result = replayRecordedAttempts(report, () => new WithholdingFixture()).results[0]
  assert.equal(result.status, 'policy-interrupted')
  assert.equal(result.triggerChunkIndex, 3)
  assert.equal(result.consumedChunks, 4)
  assert.equal(result.acceptedReasoningCodeUnits, 5)
  assert.equal(result.recordedChunks, 6)
})

test('the input records are accepted output, not a recovered provider-raw trace', () => {
  const report = readRecordedAttempts([event([delta('prefix'), finish()])])
  const replay = replayRecordedAttempts(report, () => new Pass())
  assert.equal(replay.coverage.inputBasis, 'recorded-accepted-stream-not-provider-raw')
  assert.equal(replay.results[0].status, 'no-interruption-on-recorded-input')
  assert.equal('healthy' in replay, false)
})

test('unknown assistant event formats remain visible as incomplete coverage', () => {
  const report = readRecordedAttempts([
    { type: 'assistant/chunk', data: {} }, event([delta('ok'), finish()]),
  ])
  const replay = replayRecordedAttempts(report, () => new Pass())
  assert.equal(replay.results.length, 1)
  assert.equal(replay.coverage.complete, false)
  assert.equal(replay.coverage.ignoredTypes['assistant/chunk'], 1)
  assert.ok(replay.coverage.issues.some(issue => issue.reason === 'unsupported-stream-event'))
})

test('missing assistant/message.stream is not silently treated as progress', () => {
  const report = readRecordedAttempts([{ type: 'assistant/message', data: { turn: 1, step: 1 } }])
  const replay = replayRecordedAttempts(report, () => { throw new Error('must not create a policy') })
  assert.equal(replay.results.length, 0)
  assert.equal(replay.coverage.complete, false)
  assert.equal(replay.coverage.issues[0].reason, 'missing-stream-or-coordinates')
})

test('unrelated events are inventoried without pretending they contain a stream', () => {
  const report = readRecordedAttempts([{ type: 'user/message', data: {} }, event([finish()])])
  assert.equal(report.coverage.ignoredTypes['user/message'], 1)
  assert.equal(report.coverage.complete, true)
})

for (const [name, stream] of [
  ['unknown compact record', [{ type: 'future-record', text: 'hidden' }, finish()]],
  ['invalid packed members', [{ ...run(['ok']), texts: [42] }, finish()]],
  ['bad packed timing shape', [{ ...run(['a', 'b']), dt: [] }, finish()]],
  ['missing finish', [delta('unfinished')]],
  ['two finish chunks', [finish(), finish()]],
  ['content after finish', [finish(), delta('late')]],
  ['unknown finish kind', [raw({ type: 'finish', reason: { kind: 'new-kind' } })]],
  ['malformed raw delta', [raw({ type: 'reasoning-delta', index: 0, text: 42 }), finish()]],
]) {
  test(`${name} is not evaluated as a complete attempt`, () => {
    const report = readRecordedAttempts([event(stream)])
    const replay = replayRecordedAttempts(report, () => { throw new Error('must not run incomplete input') })
    assert.equal(replay.coverage.complete, false)
    assert.equal(replay.results[0].status, 'not-evaluated-incomplete')
  })
}

test('empty or malformed inputs never imply that a session was healthy', () => {
  assert.equal(readRecordedAttempts([]).coverage.complete, false)
  assert.equal(readRecordedAttempts([null]).coverage.complete, false)
  assert.throws(() => readRecordedAttempts('not parsed events'), TypeError)
})

test('full reasoning block-end is retained but not counted as a second delta', () => {
  const report = readRecordedAttempts([event([
    delta('hello'), raw({ type: 'block-end', index: 0, block: { type: 'reasoning', text: 'hello' } }), finish(),
  ])])
  const result = replayRecordedAttempts(report, () => new Pass()).results[0]
  assert.equal(result.acceptedReasoningCodeUnits, 5)
  assert.ok(result.scope.includes('not final-block'))
})

test('tool argument runs remain structured data and never become reasoning', () => {
  const report = readRecordedAttempts([event([
    { type: 'tool-call-chunks', index: 1, id: 'synthetic-tool', name: 'probe', time0: 0, dt: [1], args: ['{"x":', '1}'] }, finish(),
  ])])
  assert.deepEqual(report.attempts[0].chunks.slice(0, 2).map(chunk => chunk.argumentsDelta), ['{"x":', '1}'])
  assert.equal(replayRecordedAttempts(report, () => new Pass()).results[0].acceptedReasoningCodeUnits, 0)
})

test('reusing one policy instance for multiple attempts is rejected', () => {
  const policy = new Pass()
  const report = readRecordedAttempts([event([finish()]), event([finish()])])
  assert.throws(() => replayRecordedAttempts(report, () => policy), /reused/)
})

test('a stateful policy cannot be reused across separate replay invocations', () => {
  class CountingPolicy extends Pass {
    total = 0
    push(chunk) {
      if (chunk.type === 'reasoning-delta') {
        this.total += chunk.text.length
        if (this.total >= 2) this.interruption = { failure: { code: 'CUMULATIVE' } }
      }
      return [chunk]
    }
  }
  const shared = new CountingPolicy()
  const first = readRecordedAttempts([event([delta('x'), finish()])])
  const second = readRecordedAttempts([event([delta('y'), finish()])])
  assert.equal(replayRecordedAttempts(first, () => shared).results[0].status, 'no-interruption-on-recorded-input')
  assert.throws(() => replayRecordedAttempts(second, () => shared), /reused/)
  assert.equal(replayRecordedAttempts(second, () => new CountingPolicy()).results[0].status, 'no-interruption-on-recorded-input')
})

test('policy errors and malformed outputs are not turned into no-hit results', () => {
  const report = readRecordedAttempts([event([delta('x'), finish()])])
  assert.throws(() => replayRecordedAttempts(report, () => { throw new Error('factory failed') }), /factory failed/)
  assert.throws(() => replayRecordedAttempts(report, () => ({ interruption: undefined, push() { return null }, flush() { return [] } })), /array/)
})

test('a policy cannot mutate the reader input through its received chunk', () => {
  const report = readRecordedAttempts([event([delta('original'), finish()])])
  const before = JSON.stringify(report)
  class MutatingPolicy extends Pass { push(chunk) { if (chunk.type === 'reasoning-delta') chunk.text = 'edited'; return [chunk] } }
  replayRecordedAttempts(report, () => new MutatingPolicy())
  assert.equal(JSON.stringify(report), before)
})

test('unknown accepted items cannot silently become a zero-output result', () => {
  const report = readRecordedAttempts([event([finish()])])
  class BadOutput extends Pass { push() { return [null] } }
  assert.throws(() => replayRecordedAttempts(report, () => new BadOutput()), /accepted output/)
})

test('pre-interrupted instances cannot masquerade as a fresh attempt', () => {
  const report = readRecordedAttempts([event([finish()])])
  const policy = new Pass()
  policy.interruption = { failure: { code: 'STALE' } }
  assert.throws(() => replayRecordedAttempts(report, () => policy), /pre-interrupted/)
})

test('the driver requires the reader coverage rather than inventing completeness', () => {
  assert.throws(() => replayRecordedAttempts({ attempts: [] }, () => new Pass()), TypeError)
})

test('flush cannot erase the driver observation of an earlier interruption', () => {
  class ClearsOnFlush extends WithholdingFixture { flush() { this.interruption = undefined; return [] } }
  const report = readRecordedAttempts([event([delta('LOOP LOOP LOOP'), finish()])])
  const result = replayRecordedAttempts(report, () => new ClearsOnFlush()).results[0]
  assert.equal(result.status, 'policy-interrupted')
  assert.equal(result.failureCode, 'FIXTURE_LOOP')
})
