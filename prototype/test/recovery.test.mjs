import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RecoveryBudget } from '../src/recovery.mjs'

const facts = (attempt, patch = {}) => ({ attempt, cause: 'reasoning-loop', cancelled: false,
  policyActive: true, cleanupSucceeded: true, settlementSucceeded: true, replayEditable: true, ...patch })
const budget = maximum => new RecoveryBudget({ scope: 'synthetic-agent/turn-1', maxRecoveries: maximum })

test('requires an explicit user-selected recovery allowance', () => {
  assert.throws(() => new RecoveryBudget({ scope: 'test' }), RangeError)
  assert.throws(() => new RecoveryBudget({ scope: '', maxRecoveries: 1 }), TypeError)
})

test('zero means stop-only without a recovery authorization', () => {
  const controller = budget(0)
  const decision = controller.decide(facts(1))
  assert.equal(decision.kind, 'stop')
  assert.equal(decision.reason, 'user-selected-stop-only')
  assert.equal(controller.snapshot.used, 0)
})

test('zero recovery allowance does not itself interrupt normal tool boundaries', () => {
  const controller = budget(0)
  const state = controller.noteToolBoundary()
  assert.equal(state.remaining, 0)
  assert.equal(state.halted, null)
  assert.equal('kind' in state, false) // No stop/interrupt intent merely because a tool ran.
})

test('a first loop need not be terminal when the user authorized one attempt', () => {
  const controller = budget(1)
  const first = controller.decide(facts(1))
  assert.deepEqual([first.kind, first.recovery, first.limit], ['recover', 1, 1])
  assert.equal(controller.decide(facts(2)).reason, 'recovery-limit')
})

test('N is recovery authorizations excluding the initial call', () => {
  const controller = budget(3)
  for (let index = 1; index <= 3; index++) {
    assert.equal(controller.decide(facts(index)).recovery, index)
  }
  assert.equal(controller.decide(facts(4)).kind, 'stop')
  assert.deepEqual([controller.snapshot.used, controller.snapshot.remaining], [3, 0])
})

test('tool boundaries do not replenish recovery allowance', () => {
  const controller = budget(1)
  controller.decide(facts(1))
  for (let index = 0; index < 100; index++) assert.equal(controller.noteToolBoundary().remaining, 0)
  assert.equal(controller.decide(facts(2)).reason, 'recovery-limit')
})

test('duplicate and stale attempt notifications cannot authorize another call', () => {
  const controller = budget(3)
  assert.equal(controller.decide(facts(2)).kind, 'recover')
  assert.equal(controller.decide(facts(2)).kind, 'ignore')
  assert.equal(controller.decide(facts(1)).kind, 'ignore')
  assert.equal(controller.snapshot.used, 1)
  assert.equal(controller.decide(facts(3)).recovery, 2)
})

for (const [reason, patch] of [
  ['cancelled', { cancelled: true }],
  ['disposed', { policyActive: false }],
  ['cleanup-failed', { cleanupSucceeded: false }],
  ['settlement-failed', { settlementSucceeded: false }],
  ['replay-not-editable', { replayEditable: false }],
  ['tool-settlement-limit', { cause: 'tool-settlement-limit' }],
]) {
  test(`${reason} is terminal for this scope and does not grant recovery`, () => {
    const controller = budget(3)
    assert.equal(controller.decide(facts(1, patch)).reason, reason)
    assert.equal(controller.decide(facts(2)).reason, reason)
    assert.equal(controller.snapshot.used, 0)
  })
}

test('later cancellation outranks an earlier authorization or duplicate frame', () => {
  const controller = budget(2)
  controller.decide(facts(1))
  assert.equal(controller.decide(facts(1, { cancelled: true })).reason, 'cancelled')
  assert.equal(controller.decide(facts(2)).kind, 'stop')
  assert.equal(controller.snapshot.used, 1)
})

test('an explicit cancel latches without waiting for another model chunk', () => {
  const controller = budget(2)
  assert.equal(controller.cancel().kind, 'stop')
  assert.equal(controller.decide(facts(1)).reason, 'cancelled')
})

test('presentation advice is data, not an automatic compaction/handoff action', () => {
  const decision = budget(0).decide(facts(1))
  assert.equal(decision.notice.channel, 'presentation-only')
  assert.deepEqual(decision.suggestions, ['review-state', 'consider-compaction', 'prepare-handoff'])
  assert.equal('execute' in decision, false)
  assert.ok(decision.notice['zh-CN'].includes('可能仍含重复'))
  assert.ok(Object.isFrozen(decision.suggestions))
})

test('independent scopes have separate allowances, not a claimed session-global quota', () => {
  const first = budget(1)
  first.decide(facts(1))
  const next = new RecoveryBudget({ scope: 'synthetic-agent/turn-2', maxRecoveries: 1 })
  assert.equal(next.decide(facts(1)).kind, 'recover')
  assert.equal(first.snapshot.remaining, 0)
})

test('later configuration-object mutation cannot increase this controller allowance', () => {
  const config = { scope: 'test', maxRecoveries: 1 }
  const controller = new RecoveryBudget(config)
  config.maxRecoveries = 100
  controller.decide(facts(1))
  assert.equal(controller.decide(facts(2)).kind, 'stop')
})

for (const value of [-1, 0.5, Infinity, NaN, '1']) {
  test(`rejects invalid recovery limit ${String(value)}`, () => assert.throws(() => budget(value), RangeError))
}

test('lifecycle facts and attempt identity cannot be silently omitted', () => {
  const controller = budget(1)
  assert.throws(() => controller.decide({ attempt: 1, cause: 'reasoning-loop' }), TypeError)
  assert.throws(() => controller.decide(facts(0)), RangeError)
  assert.throws(() => controller.decide(facts(1, { cause: 'arbitrary-error' })), TypeError)
  assert.equal(controller.snapshot.used, 0)
})
