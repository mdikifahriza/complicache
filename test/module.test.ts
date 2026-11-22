import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createCacheModule } from '../src/core/module'
import { defineCacheSchema, defineModelEffects } from '../src/builders'
import type { CacheAdapter } from '../src/types'

/**
 * In-memory adapter untuk testing — tidak butuh Next.js.
 * Merekam tag mana yang direvalidasi dan cache call apa yang masuk.
 */
function createTestAdapter() {
  const revalidatedTags: string[] = []
  const cachedCalls: { keys: readonly string[]; tags: string[]; revalidate?: number }[] = []

  const adapter: CacheAdapter = {
    cache(loader, keys, options) {
      cachedCalls.push({ keys, tags: options.tags, revalidate: options.revalidate })
      // Langsung kembalikan loader tanpa wrapping — cukup untuk test
      return loader
    },
    revalidateTag(tag) {
      revalidatedTags.push(tag)
    },
  }

  return { adapter, revalidatedTags, cachedCalls }
}

const SCHEMA = defineCacheSchema({
  news:    { ttl: 300 },
  events:  { ttl: 300 },
  gallery: {},
  sitemap: { ttl: 43200, dependsOn: ['news', 'events'] as const },
})

const MODEL_EFFECTS = defineModelEffects<
  'News' | 'Event' | 'GalleryAlbum' | 'Setting',
  keyof typeof SCHEMA
>({
  News:        ['news'],
  Event:       ['events'],
  GalleryAlbum: ['gallery'],
  Setting:     'none',
})

describe('createCacheModule', () => {
  it('cached() meneruskan TTL ke adapter', () => {
    const { adapter, cachedCalls } = createTestAdapter()
    const { cached } = createCacheModule(SCHEMA, MODEL_EFFECTS, { adapter })

    cached('news', [], async () => [])

    assert.equal(cachedCalls.length, 1)
    assert.equal(cachedCalls[0].revalidate, 300)
    assert.deepEqual(cachedCalls[0].tags, ['cache:news'])
  })

  it('cached() tanpa TTL tidak meneruskan revalidate', () => {
    const { adapter, cachedCalls } = createTestAdapter()
    const { cached } = createCacheModule(SCHEMA, MODEL_EFFECTS, { adapter })

    cached('gallery', [], async () => [])

    assert.equal(cachedCalls[0].revalidate, undefined)
  })

  it('invalidate() mematikan cache itu sendiri', () => {
    const { adapter, revalidatedTags } = createTestAdapter()
    const { invalidate } = createCacheModule(SCHEMA, MODEL_EFFECTS, { adapter })

    invalidate('gallery')

    assert.ok(revalidatedTags.includes('cache:gallery'))
  })

  it('invalidate() mengikutsertakan dependan (sitemap dependsOn news)', () => {
    const { adapter, revalidatedTags } = createTestAdapter()
    const { invalidate } = createCacheModule(SCHEMA, MODEL_EFFECTS, { adapter })

    invalidate('news')

    assert.ok(revalidatedTags.includes('cache:news'))
    assert.ok(revalidatedTags.includes('cache:sitemap'))
  })

  it('invalidate() mengikutsertakan dependan dari beberapa cache sekaligus', () => {
    const { adapter, revalidatedTags } = createTestAdapter()
    const { invalidate } = createCacheModule(SCHEMA, MODEL_EFFECTS, { adapter })

    invalidate('news', 'events')

    assert.ok(revalidatedTags.includes('cache:news'))
    assert.ok(revalidatedTags.includes('cache:events'))
    assert.ok(revalidatedTags.includes('cache:sitemap'))
    // sitemap hanya direvalidasi sekali meski dipicu dari dua sumber
    assert.equal(revalidatedTags.filter(t => t === 'cache:sitemap').length, 1)
  })

  it('invalidateModel() memetakan model ke cache yang benar', () => {
    const { adapter, revalidatedTags } = createTestAdapter()
    const { invalidateModel } = createCacheModule(SCHEMA, MODEL_EFFECTS, { adapter })

    invalidateModel('News')

    assert.ok(revalidatedTags.includes('cache:news'))
    assert.ok(revalidatedTags.includes('cache:sitemap')) // dependan news
  })

  it('invalidateModel() dengan "none" tidak memanggil revalidateTag', () => {
    const { adapter, revalidatedTags } = createTestAdapter()
    const { invalidateModel } = createCacheModule(SCHEMA, MODEL_EFFECTS, { adapter })

    invalidateModel('Setting')

    assert.equal(revalidatedTags.length, 0)
  })

  it('invalidateAll() mematikan semua cache di schema', () => {
    const { adapter, revalidatedTags } = createTestAdapter()
    const { invalidateAll } = createCacheModule(SCHEMA, MODEL_EFFECTS, { adapter })

    invalidateAll()

    for (const name of Object.keys(SCHEMA)) {
      assert.ok(revalidatedTags.includes(`cache:${name}`), `cache:${name} harus ada`)
    }
  })

  it('withDependents() menghitung dependan tanpa side effect', () => {
    const { adapter, revalidatedTags } = createTestAdapter()
    const { withDependents } = createCacheModule(SCHEMA, MODEL_EFFECTS, { adapter })

    const result = withDependents(['news'])

    assert.ok(result.has('news'))
    assert.ok(result.has('sitemap'))
    // Tidak ada revalidateTag yang dipanggil
    assert.equal(revalidatedTags.length, 0)
  })
})
