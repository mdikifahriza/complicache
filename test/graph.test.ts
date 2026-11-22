import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildReverseGraph, resolveDependents } from '../src/core/graph'

describe('buildReverseGraph', () => {
  it('membangun reverse map yang benar', () => {
    const schema = {
      news:    {},
      events:  {},
      sitemap: { dependsOn: ['news', 'events'] as const },
    }
    const graph = buildReverseGraph(schema)

    assert.deepEqual([...graph.get('news')!], ['sitemap'])
    assert.deepEqual([...graph.get('events')!], ['sitemap'])
    assert.deepEqual([...graph.get('sitemap')!], [])
  })

  it('cache tanpa dependan tetap ada di graph', () => {
    const schema = { news: {}, gallery: {} }
    const graph = buildReverseGraph(schema)

    assert.ok(graph.has('news'))
    assert.ok(graph.has('gallery'))
    assert.equal(graph.get('news')!.size, 0)
  })

  it('tidak crash jika dependsOn merujuk cache yang tidak ada (hanya warning)', () => {
    const schema = {
      news: { dependsOn: ['ghost'] as const },
    }
    // Tidak throw — hanya console.warn
    assert.doesNotThrow(() => buildReverseGraph(schema))
  })
})

describe('resolveDependents', () => {
  it('mengembalikan nama itu sendiri jika tidak punya dependan', () => {
    const schema = { news: {}, events: {} }
    const graph = buildReverseGraph(schema)
    const result = resolveDependents(graph, ['news'])

    assert.ok(result.has('news'))
    assert.equal(result.size, 1)
  })

  it('mengikutsertakan dependan langsung', () => {
    const schema = {
      news:    {},
      sitemap: { dependsOn: ['news'] as const },
    }
    const graph = buildReverseGraph(schema)
    const result = resolveDependents(graph, ['news'])

    assert.ok(result.has('news'))
    assert.ok(result.has('sitemap'))
    assert.equal(result.size, 2)
  })

  it('mengikutsertakan dependan rekursif (transitif)', () => {
    const schema = {
      news:     {},
      sitemap:  { dependsOn: ['news'] as const },
      homepage: { dependsOn: ['sitemap'] as const },
    }
    const graph = buildReverseGraph(schema)
    const result = resolveDependents(graph, ['news'])

    assert.ok(result.has('news'))
    assert.ok(result.has('sitemap'))
    assert.ok(result.has('homepage'))
    assert.equal(result.size, 3)
  })

  it('tidak loop jika ada siklus (defensive)', () => {
    // Siklus tidak akan terjadi di schema yang wajar,
    // tapi graph tetap harus tidak hang
    const graph = new Map([
      ['a', new Set(['b'])],
      ['b', new Set(['a'])],
    ])
    const result = resolveDependents(graph, ['a'])

    assert.ok(result.has('a'))
    assert.ok(result.has('b'))
    assert.equal(result.size, 2)
  })

  it('menangani beberapa nama sekaligus', () => {
    const schema = {
      news:    {},
      events:  {},
      sitemap: { dependsOn: ['news', 'events'] as const },
    }
    const graph = buildReverseGraph(schema)
    const result = resolveDependents(graph, ['news', 'events'])

    assert.ok(result.has('news'))
    assert.ok(result.has('events'))
    assert.ok(result.has('sitemap'))
    assert.equal(result.size, 3)
  })
})
