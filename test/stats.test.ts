import test from 'node:test'
import assert from 'node:assert/strict'
import { createCacheModule, createMemoryDriver, type CacheLogger } from '../src/index'

const SCHEMA = {
  news: { ttl: 300 },
  sitemap: { ttl: 300, dependsOn: ['news'] },
} as const

function setup(extra?: Partial<CacheLogger>) {
  const events: string[] = []
  const logger: CacheLogger = {
    hit: (n) => events.push(`hit:${n}`),
    miss: (n) => events.push(`miss:${n}`),
    error: (_e, ctx) => events.push(`error:${ctx}`),
    ...extra,
  }
  const cache = createCacheModule(
    SCHEMA,
    { News: ['news'] },
    { driver: createMemoryDriver(), logger }
  )
  return { cache, events }
}

test('hit/miss dilog dan dihitung; invalidasi memaksa miss lagi', async () => {
  const { cache, events } = setup()
  let runs = 0
  const getNews = cache.wrap('news', [], async (x: number) => {
    runs++
    return x * 2
  })

  assert.equal(await getNews(1), 2) // miss
  assert.equal(await getNews(1), 2) // hit
  assert.equal(await getNews(2), 4) // miss (argumen lain)
  assert.deepEqual(events, ['miss:news', 'hit:news', 'miss:news'])
  assert.equal(runs, 2)

  let s = cache.stats()
  assert.equal(s.news.calls, 3)
  assert.equal(s.news.misses, 2)
  assert.equal(s.news.hits, 1)
  assert.equal(s.news.errors, 0)
  assert.ok(s.news.lastLoaderMs! >= 0)
  assert.equal(s.news.lastInvalidatedAt, null)
  assert.equal(s.sitemap.calls, 0) // cache yang belum dipakai tetap muncul

  cache.invalidateModel('News')
  s = cache.stats()
  assert.ok(s.news.lastInvalidatedAt! > 0)
  assert.ok(s.sitemap.lastInvalidatedAt! > 0, 'dependan ikut tercatat')

  await getNews(1)
  assert.equal(cache.stats().news.misses, 3)
})

test('loader yang gagal dihitung sebagai miss + error, error diteruskan', async () => {
  const { cache } = setup()
  const bad = cache.wrap('news', ['bad'], async () => {
    throw new Error('boom')
  })
  await assert.rejects(bad(), /boom/)
  const s = cache.stats().news
  assert.equal(s.misses, 1)
  assert.equal(s.errors, 1)
  assert.equal(s.hits, 0)
})

test('resetStats mengosongkan counter', async () => {
  const { cache } = setup()
  await cache.wrap('news', [], async () => 1)()
  cache.resetStats()
  assert.equal(cache.stats().news.calls, 0)
})

test('audit() & explain() tersedia di module', () => {
  const { cache } = setup()
  assert.deepEqual(cache.audit(), [])
  assert.equal(cache.explain('news'), 'news\n└─ sitemap')
})

test('revalidateTag async yang ditolak dilaporkan ke logger, bukan unhandled rejection', async () => {
  const events: string[] = []
  const driver = {
    ...createMemoryDriver(),
    revalidateTag: () => Promise.reject(new Error('remote down')),
  }
  const cache = createCacheModule(SCHEMA, {}, {
    driver,
    logger: { error: (_e, ctx) => events.push(ctx) },
  })
  cache.invalidate('news')
  await new Promise((r) => setTimeout(r, 10))
  assert.deepEqual(events, ['revalidateTag(news)', 'revalidateTag(sitemap)'])
})
