/**
 * User-authorized recovery decisions only. No model, tools, context mutation,
 * compaction, session migration or quarantine is executed by this module.
 */
const SUGGESTIONS = Object.freeze(['review-state', 'consider-compaction', 'prepare-handoff'])
const STOP_NOTICE = Object.freeze({
  channel: 'presentation-only',
  en: 'No further automatic recovery was authorized. Review the recorded state; context may still contain repetition. Consider curating context or preparing a handoff.',
  'zh-CN': '未安排进一步自动恢复。请检查现有状态；上下文可能仍含重复，可考虑整理或压缩上下文，或及时准备交接并更换会话。',
})

export class RecoveryBudget {
  #scope
  #maximum
  #used = 0
  #lastAttempt = 0
  #halted

  /** Explicit user choice: zero is stop-only; N permits N recovery authorizations, excluding the initial call. */
  constructor({ scope, maxRecoveries }) {
    if (typeof scope !== 'string' || scope.trim() === '') throw new TypeError('a stable scope is required')
    if (!Number.isSafeInteger(maxRecoveries) || maxRecoveries < 0) throw new RangeError('maxRecoveries must be a non-negative safe integer')
    this.#scope = scope
    this.#maximum = maxRecoveries
  }

  get snapshot() {
    return Object.freeze({ scope: this.#scope, limit: this.#maximum, used: this.#used,
      remaining: this.#maximum - this.#used, halted: this.#halted ?? null })
  }

  /** A tool boundary may reset another component's local window, never this allowance. */
  noteToolBoundary() { return this.snapshot }

  /** Parent/user cancellation is terminal for this controller's scope. */
  cancel() { this.#halted = 'cancelled'; return this.#stop('cancelled') }

  /**
   * Called after a real guard interruption, with lifecycle facts supplied by a
   * trusted Host adapter, never inferred from model text. An intent is NOT an
   * executed continuation; the Host must recheck cancellation before dispatch.
   */
  decide({ attempt, cause, cancelled, policyActive, cleanupSucceeded, settlementSucceeded, replayEditable }) {
    if (!Number.isSafeInteger(attempt) || attempt < 1) throw new RangeError('attempt must be a positive monotonic safe integer')
    if (cause !== 'reasoning-loop' && cause !== 'tool-settlement-limit') throw new TypeError('unknown interruption cause')
    for (const flag of [cancelled, policyActive, cleanupSucceeded, settlementSucceeded, replayEditable]) {
      if (typeof flag !== 'boolean') throw new TypeError('all lifecycle facts must be explicit booleans')
    }
    if (cancelled || !policyActive) {
      this.#halted = cancelled ? 'cancelled' : 'disposed'
      return this.#stop(this.#halted)
    }
    if (this.#halted !== undefined) return this.#stop(this.#halted)
    if (attempt <= this.#lastAttempt) return Object.freeze({ kind: 'ignore', reason: 'stale-or-duplicate', scope: this.#scope })
    this.#lastAttempt = attempt
    if (!cleanupSucceeded || !settlementSucceeded || !replayEditable || cause === 'tool-settlement-limit') {
      this.#halted = !cleanupSucceeded ? 'cleanup-failed' : !settlementSucceeded ? 'settlement-failed'
        : !replayEditable ? 'replay-not-editable' : 'tool-settlement-limit'
      return this.#stop(this.#halted)
    }
    if (this.#used >= this.#maximum) return this.#stop(this.#maximum === 0 ? 'user-selected-stop-only' : 'recovery-limit')
    this.#used++
    return Object.freeze({ kind: 'recover', scope: this.#scope, recovery: this.#used, limit: this.#maximum,
      notice: Object.freeze({ channel: 'presentation-only',
        en: `Authorized recovery attempt ${this.#used}/${this.#maximum}; execution is not yet confirmed.`,
        'zh-CN': `已授权第 ${this.#used}/${this.#maximum} 次恢复尝试；尚未确认实际执行。` }) })
  }

  #stop(reason) {
    return Object.freeze({ kind: 'stop', reason, scope: this.#scope,
      used: this.#used, limit: this.#maximum, notice: STOP_NOTICE, suggestions: SUGGESTIONS })
  }
}
