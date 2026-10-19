import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SentenceUnits, unitEvidence } from '../src/sentence-units.mjs'

function scan(chunks, options) {
  const scanner = new SentenceUnits(options)
  const units = chunks.flatMap(chunk => scanner.push(chunk))
  units.push(...scanner.finish())
  return { units, coverage: scanner.coverage }
}

const examples = [
  ['English periods', 'Read the file. Call the tool. Done.', ['Read the file.', 'Call the tool.', 'Done.']],
  ['CJK and terminal runs', '检查文件。！！现在执行！？', ['检查文件。！！', '现在执行！？']],
  ['semicolons and CRLF', 'alpha; beta；\r\ngamma\n', ['alpha;', 'beta；', 'gamma']],
  ['internal decimal/version/path dots', 'Use 3.14 with v1.2.3 in src/a.b.ts. Next.', ['Use 3.14 with v1.2.3 in src/a.b.ts.', 'Next.']],
  ['IP addresses within prose', 'Use 127.0.0.1 and 2001:db8::1. Next.', ['Use 127.0.0.1 and 2001:db8::1.', 'Next.']],
  ['URL within prose', 'Visit https://example.com/a.b. Then act.', ['Visit https://example.com/a.b.', 'Then act.']],
  ['closing quote', 'He said "ready." Next.', ['He said "ready."', 'Next.']],
  ['closing bracket', 'The answer is (done.) Next.', ['The answer is (done.)', 'Next.']],
  ['ellipsis', 'Wait... Then proceed.', ['Wait...', 'Then proceed.']],
  ['Unicode whitespace', 'First.\u00a0Second.', ['First.', 'Second.']],
  ['emoji', 'Check 🔧. Continue.', ['Check 🔧.', 'Continue.']],
  ['punctuation alone', '... !!!\n。', []],
]
for (const [name, text, expected] of examples) {
  test(name, () => {
    assert.deepEqual(scan([text]).units, expected)
    assert.deepEqual(scan(text.split('')).units, expected)
    for (let cut = 0; cut <= text.length; cut++) {
      assert.deepEqual(scan([text.slice(0, cut), text.slice(cut)]).units, expected)
    }
  })
}

test('a delta boundary is not evidence that a period ends a sentence', () => {
  const scanner = new SentenceUnits()
  assert.deepEqual(scanner.push('file.'), [])
  assert.deepEqual(scanner.push('txt '), [])
  assert.deepEqual(scanner.finish(), [])
  assert.ok(scanner.coverage.incomplete)
})

test('a final period is settled only at real input end', () => {
  const scanner = new SentenceUnits()
  assert.deepEqual(scanner.push('Done.'), [])
  assert.deepEqual(scanner.push(' Next.'), ['Done.'])
  assert.deepEqual(scanner.finish(), ['Next.'])
  assert.deepEqual(scanner.finish(), [])
  assert.throws(() => scanner.push('later'), /finished/)
})

test('unterminated prose is reported, not fabricated into a whole unit', () => {
  const result = scan(['This is unfinished'])
  assert.deepEqual(result.units, [])
  assert.equal(result.coverage.incompleteTailCodeUnits, 18)
  assert.equal(result.coverage.incomplete, true)
})

test('an overlong unit is discarded whole and coverage remains incomplete', () => {
  const result = scan(['0123456789. ok.'], { maxPendingCodeUnits: 8 })
  assert.deepEqual(result.units, ['ok.'])
  assert.equal(result.coverage.overflowedUnits, 1)
  assert.equal(result.coverage.incomplete, true)
})

test('an unpunctuated stream cannot grow the internal pending string without bound', () => {
  const scanner = new SentenceUnits({ maxPendingCodeUnits: 8 })
  scanner.maxPendingCodeUnits = Infinity // Cannot alter the private configured ceiling.
  for (let index = 0; index < 10000; index++) {
    assert.deepEqual(scanner.push('x'), [])
    assert.ok(scanner.coverage.pendingCodeUnits <= 8)
  }
  assert.deepEqual(scanner.finish(), [])
  assert.equal(scanner.coverage.overflowedUnits, 1)
})

for (const value of [0, -1, 8193, 1.5, Infinity, NaN, '8']) {
  test(`rejects invalid retention ${String(value)}`, () => {
    assert.throws(() => new SentenceUnits({ maxPendingCodeUnits: value }), RangeError)
  })
}

test('counts whole units, not substrings inside another word', () => {
  const units = scan(['好。完好。好。']).units
  const evidence = unitEvidence(units)
  assert.equal(evidence.total, 3)
  assert.equal(evidence.distinct, 2)
  assert.equal(evidence.repeatedUnitShare, 2 / 3)
  assert.equal(evidence.repeatedCharacterShare, 4 / 7)
})

test('novelty is not a synonym for recurring-occurrence share', () => {
  const evidence = unitEvidence(['A.', 'B.', 'A.', 'B.'])
  assert.equal(evidence.novelty, 0.5)
  assert.equal(evidence.repeatedUnitShare, 1)
})

test('empty input yields no evidence, not a health classification', () => {
  assert.deepEqual(scan(['']).units, [])
  assert.equal(unitEvidence([]).total, 0)
  assert.equal(unitEvidence([]).novelty, 1)
  assert.equal('healthy' in unitEvidence([]), false)
})

test('the evidence metric uses trimmed whole units consistently', () => {
  assert.equal(unitEvidence(['A. ', ' A.']).distinct, 1)
})

test('rejects non-text input and invalid metric units', () => {
  assert.throws(() => new SentenceUnits().push(null), TypeError)
  assert.throws(() => unitEvidence([' ']), TypeError)
  assert.throws(() => unitEvidence([42]), TypeError)
})
