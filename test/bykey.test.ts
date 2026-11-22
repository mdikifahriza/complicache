import test from 'node:test'
import assert from 'node:assert/strict'
import { createCacheModule, createMemoryDriver } from '../src/index'

function setup() {
  const cache = createCacheModule(
    {
      newsDetail: { ttl: 300 },
      newsList: { ttl: 300, dependsOn: ['newsDetail'] },
    },
    { News: ['newsDetail'] },
    { driver: createMemoryDriver() }
  )
  const runs: Record<string, number> = {}
  const getNews = cache.wrapByKey(
    'newsDetail',
    ['by-slug'],
    async (slug: string) => {
      runs[slug] = (runs[slug] ?? 0) + 1
      return { slug, v: runs[slug] }
    },
    (slug) => slug
  )
  let listRuns = 0
  const getList = cache.wrap('newsList', [], async () => ++listRuns)
  return { cache, getNews, getList, runs, listRuns: () => listRuns }
}

test('invalidateKey mematikan satu record saja, record lain tetap hangat', async () => {
  const { cache, getNews, runs } = setup()
  await getNews('a'); await getNews('b')
  await getNews('a'); await getNews('b')
  assert.deepEqual(runs, { a: 1, b: 1 })

  cache.invalidateKey('newsDetail', 'a')
  assert.equal((await getNews('a')).v, 2) // a dimuat ulang
  assert.equal((await getNews('b')).v, 1) // b tidak tersentuh
  assert.deepEqual(runs, { a: 2, b: 1 })
})

test('invalidateKey meng-cascade ke dependan secara utuh', async () => {
  const { cache, getNews, getList } = setup()
  await getNews('a')
  assert.equal(await getList(), 1)
  assert.equal(await getList(), 1)
  cache.invalidateKey('newsDetail', 'a')
  assert.equal(await getList(), 2)
})

test('invalidate(name) tetap mematikan semua record (tag per-nama ikut terpasang)', async () => {
  const { cache, getNews, runs } = setup()
  await getNews('a'); await getNews('b')
  cache.invalidate('newsDetail')
  await getNews('a'); await getNews('b')
  assert.deepEqual(runs, { a: 2, b: 2 })
})

test('invalidateModel (lewat effects) juga mematikan semua record', async () => {
  const { cache, getNews, runs } = setup()
  await getNews('a')
  cache.invalidateModel('News')
  await getNews('a')
  assert.equal(runs.a, 2)
})

test('stats tercatat per nama; nama tak dikenal ditolak', async () => {
  const { cache, getNews } = setup()
  await getNews('a'); await getNews('a'); await getNews('b')
  const s = cache.stats().newsDetail
  assert.equal(s.calls, 3)
  assert.equal(s.misses, 2)
  assert.equal(s.hits, 1)
  assert.throws(() => cache.invalidateKey('nope' as any, 'x'), /tidak ada di schema/)
  assert.throws(() => cache.wrapByKey('nope' as any, [], async () => 1, () => 'x'), /tidak ada di schema/)
})
