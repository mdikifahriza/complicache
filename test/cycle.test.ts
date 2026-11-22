import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { detectCycles, buildReverseGraph } from '../src/core/graph'
import { CacheSchemaError } from '../src/core/errors'

describe('detectCycles', () => {
  it('mengembalikan null jika schema tidak memiliki siklus', () => {
    const schema = {
      news: {},
      events: {},
      sitemap: { dependsOn: ['news', 'events'] as const },
      feed: { dependsOn: ['sitemap'] as const },
    }
    const cycle = detectCycles(schema)
    assert.equal(cycle, null)
  })

  it('mendeteksi siklus 2 arah (A -> B -> A)', () => {
    const schema = {
      a: { dependsOn: ['b'] as const },
      b: { dependsOn: ['a'] as const },
    }
    const cycle = detectCycles(schema)
    assert.ok(cycle !== null)
    assert.ok(cycle?.includes('a') && cycle?.includes('b'))
  })

  it('mendeteksi siklus 3 arah (A -> B -> C -> A)', () => {
    const schema = {
      a: { dependsOn: ['b'] as const },
      b: { dependsOn: ['c'] as const },
      c: { dependsOn: ['a'] as const },
    }
    const cycle = detectCycles(schema)
    assert.ok(cycle !== null)
    assert.ok(cycle?.includes('a') && cycle?.includes('b') && cycle?.includes('c'))
  })

  it('buildReverseGraph melempar CacheSchemaError jika ada siklus', () => {
    const schema = {
      a: { dependsOn: ['b'] as const },
      b: { dependsOn: ['a'] as const },
    }

    assert.throws(
      () => buildReverseGraph(schema),
      (err: unknown) => {
        return (
          err instanceof CacheSchemaError &&
          err.message.includes('Circular dependency terdeteksi')
        )
      }
    )
  })
})
