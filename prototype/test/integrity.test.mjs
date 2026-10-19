import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const manifest = JSON.parse(readFileSync(new URL('../../provenance.json', import.meta.url), 'utf8'))

test('the historical source manifest remains a separate pinned snapshot', () => {
  assert.equal(manifest.sourceCommit, '557c9d8f98b2ff4de429257e38db24b713242e6f')
  assert.equal(manifest.notInstallable, true)
  assert.equal(manifest.files.length, 23)
})

for (const file of manifest.files) {
  test(`historical bytes unchanged: ${file.path}`, () => {
    assert.ok(file.path.startsWith('reference/') && !file.path.includes('..'))
    const bytes = readFileSync(new URL('../../' + file.path, import.meta.url))
    assert.equal(bytes.length, file.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256)
  })
}
