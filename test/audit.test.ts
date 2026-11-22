import test from 'node:test'
import assert from 'node:assert/strict'
import {
  auditSchema,
  explain,
  defineCacheSchema,
  defineModelEffects,
  defineModelEffectsStrict,
} from '../src/index'

const SCHEMA = defineCacheSchema({
  news: { ttl: 300 },
  events: { ttl: 300 },
  sitemap: { ttl: 43200, dependsOn: ['news', 'events'] },
  homepage: { dependsOn: ['sitemap'] }, // permanen, tapi terjangkau lewat sitemap
  settings: {}, // permanen
  legacy: {}, // permanen, tidak dipicu apa pun
})

test('auditSchema: bersih bila semua cache permanen terjangkau', () => {
  const s = defineCacheSchema({ news: { ttl: 60 }, settings: {} })
  const e = defineModelEffects<'News' | 'Setting', keyof typeof s>({
    News: ['news'],
    Setting: ['settings'],
  })
  assert.deepEqual(auditSchema(s, e), [])
})

test('auditSchema: cache permanen yatim dilaporkan, yang terjangkau lewat dependsOn tidak', () => {
  const e = defineModelEffects<'News' | 'Setting', keyof typeof SCHEMA>({
    News: ['news'],
    Setting: ['settings'],
  })
  const issues = auditSchema(SCHEMA, e)
  assert.deepEqual(
    issues.map((i) => [i.code, i.subject]),
    [['orphan-permanent-cache', 'legacy']]
  )
})

test('auditSchema: effect & dependsOn ke cache yang tidak ada', () => {
  const issues = auditSchema(
    { a: { ttl: 1, dependsOn: ['ghost'] } },
    { Model: ['nope'] }
  )
  const codes = issues.map((i) => i.code).sort()
  assert.deepEqual(codes, ['depends-on-unknown-cache', 'effect-unknown-cache'])
})

test("auditSchema: 'none' dan tanpa effects tidak error", () => {
  assert.deepEqual(auditSchema({ a: { ttl: 5 } }, { M: 'none' }), [])
  assert.equal(auditSchema({ a: {} }).length, 1)
})

test('explain: pohon cascade', () => {
  assert.equal(
    explain(SCHEMA, 'news'),
    ['news', '└─ sitemap', '   └─ homepage'].join('\n')
  )
  assert.equal(explain(SCHEMA, 'legacy'), 'legacy')
  assert.throws(() => explain(SCHEMA, 'nope'), /tidak ada di schema/)
})

test('defineModelEffectsStrict: model yang lupa didaftarkan = error compile', () => {
  type M = 'A' | 'B'
  defineModelEffectsStrict<M, 'x'>({ A: ['x'], B: 'none' })
  // @ts-expect-error B tidak didaftarkan
  defineModelEffectsStrict<M, 'x'>({ A: ['x'] })
})
