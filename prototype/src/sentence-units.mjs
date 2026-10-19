/**
 * Experimental sentence boundaries, NOT wired into the pinned Core snapshot.
 * Whole units are preserved; this is neither an NLP tokenizer nor a text editor.
 */
const HARD_END = new Set(['。', '！', '？', '!', '?', '；', ';', '\r', '\n'])
const CLOSER = new Set(['"', "'", '”', '’', '»', ')', ']', '}'])
const blank = char => char.trim() === ''
const meaningful = text => /[\p{L}\p{N}\p{S}]/u.test(text)

export class SentenceUnits {
  #maxPendingCodeUnits
  #pending = ''
  #ending = false
  #dot = false
  #discarding = false
  #overflowedUnits = 0
  #incompleteTailCodeUnits = 0
  #finished = false

  constructor({ maxPendingCodeUnits = 8192 } = {}) {
    if (!Number.isSafeInteger(maxPendingCodeUnits) || maxPendingCodeUnits < 1 || maxPendingCodeUnits > 8192) {
      throw new RangeError('maxPendingCodeUnits must be an integer in [1, 8192]')
    }
    this.#maxPendingCodeUnits = maxPendingCodeUnits
  }

  /** Process UTF-16 code units without treating a delta boundary as sentence end. */
  push(text) {
    if (this.#finished) throw new Error('scanner already finished')
    if (typeof text !== 'string') throw new TypeError('text must be a string')
    const units = []
    for (let index = 0; index < text.length; index++) {
      const char = text[index]
      // A period becomes a boundary only with whitespace (optionally after
      // closing quotes/brackets). Internal decimal/version/path dots stay text.
      if (this.#dot && blank(char)) this.#emit(units)
      else if (this.#dot && !CLOSER.has(char) && char !== '.') this.#dot = false
      if (this.#ending && !HARD_END.has(char) && !CLOSER.has(char)) this.#emit(units)
      if (!this.#discarding && this.#pending.length === 0 && blank(char)) continue
      if (!this.#discarding) {
        if (this.#pending.length >= this.#maxPendingCodeUnits) {
          this.#pending = ''
          this.#discarding = true
          this.#overflowedUnits++
        } else this.#pending += char
      }
      if (HARD_END.has(char)) {
        this.#ending = true
        this.#dot = false
      } else if (char === '.' && !this.#ending) this.#dot = true
    }
    return units
  }

  /** Only a real input end, never a chunk boundary. Incomplete prose is not invented as a unit. */
  finish() {
    if (this.#finished) return []
    const units = []
    if (this.#ending || this.#dot) this.#emit(units)
    else {
      this.#incompleteTailCodeUnits = this.#pending.length
      this.#pending = ''
    }
    this.#finished = true
    return units
  }

  get coverage() {
    return Object.freeze({
      pendingCodeUnits: this.#pending.length,
      overflowedUnits: this.#overflowedUnits,
      incompleteTailCodeUnits: this.#incompleteTailCodeUnits,
      incomplete: this.#overflowedUnits > 0 || this.#incompleteTailCodeUnits > 0,
      finished: this.#finished,
    })
  }

  #emit(units) {
    const unit = this.#pending.trim()
    if (!this.#discarding && meaningful(unit)) units.push(unit)
    this.#pending = ''
    this.#ending = false
    this.#dot = false
    this.#discarding = false
  }
}

/** Descriptive statistics, not an intervention threshold or accuracy claim. */
export function unitEvidence(units) {
  if (!Array.isArray(units) || units.some(unit => typeof unit !== 'string' || unit.trim() === '')) {
    throw new TypeError('units must contain non-blank whole strings')
  }
  const counts = new Map()
  let characters = 0
  for (const original of units) {
    const unit = original.trim()
    characters += unit.length
    counts.set(unit, (counts.get(unit) ?? 0) + 1)
  }
  let repeated = 0, repeatedCharacters = 0
  for (const [unit, count] of counts) {
    if (count > 1) { repeated += count; repeatedCharacters += count * unit.length }
  }
  return Object.freeze({
    total: units.length,
    distinct: counts.size,
    novelty: units.length === 0 ? 1 : counts.size / units.length,
    repeatedUnitShare: units.length === 0 ? 0 : repeated / units.length,
    repeatedCharacterShare: characters === 0 ? 0 : repeatedCharacters / characters,
  })
}
