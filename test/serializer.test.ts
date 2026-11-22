import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { defaultSerializer as s } from '../src/core/serializer'

test('Date & BigInt round-trip (nested, array, top-level)', () => {
  const d = new Date('2026-01-02T03:04:05.000Z')
  const input = { d, list: [d, 1n], nested: { big: 123456789012345678901234567890n }, top: 'x' }
  const out = s.deserialize(s.serialize(input)) as typeof input
  assert.ok(out.d instanceof Date && out.d.getTime() === d.getTime())
  assert.ok(out.list[0] instanceof Date)
  assert.equal(out.list[1], 1n)
  assert.equal(out.nested.big, 123456789012345678901234567890n)

  const top = s.deserialize(s.serialize(d))
  assert.ok(top instanceof Date, 'Date di level teratas harus tetap Date')
})

test('tidak bergantung pada `this` replacer: Date lintas-realm tetap terdeteksi', () => {
  const foreign = vm.runInNewContext('new Date(0)') as Date
  assert.equal(foreign instanceof Date, false)
  const out = s.deserialize(s.serialize({ foreign })) as { foreign: Date }
  assert.ok(out.foreign instanceof Date)
  assert.equal(out.foreign.getTime(), 0)
})

test('perilaku JSON standar dipertahankan', () => {
  const out = s.serialize({ a: undefined, f() {}, u: new URL('https://x.test/a'), n: null, arr: [undefined] })
  assert.equal(out, '{"u":"https://x.test/a","n":null,"arr":[null]}')
  assert.equal(s.serialize({ toJSON: () => ({ when: new Date(0) }) }).includes('"__type":"Date"'), true)
})

test('circular & Date invalid -> CacheSerializationError', () => {
  const a: Record<string, unknown> = {}
  a.self = a
  assert.throws(() => s.serialize(a), /Gagal menyerialisasi/)
  assert.throws(() => s.serialize(new Date('nope')), /Gagal menyerialisasi/)
  // referensi ganda (bukan circular) harus lolos
  const shared = { x: 1 }
  assert.equal(s.serialize({ p: shared, q: shared }), '{"p":{"x":1},"q":{"x":1}}')
})
