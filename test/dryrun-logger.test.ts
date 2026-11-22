import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createCacheModule } from '../src/core/module'
import { defineCacheSchema, defineModelEffects } from '../src/builders'
import type { CacheDriver, CacheDescriptor } from '../src/types'

function createMockDriver() {
  const revalidatedTags: string[] = []
  const revalidatedPaths: { path: string; type?: 'page' | 'layout' }[] = []

  const driver: CacheDriver = {
    name: 'mock',
    capabilities: {
      supportsTags: true,
      supportsTTL: true,
      supportsRemote: false,
      supportsPrivate: false,
    },
    wrap<TArgs extends unknown[], TResult>(
      fn: (...args: TArgs) => Promise<TResult>,
      _descriptor: CacheDescriptor
    ): (...args: TArgs) => Promise<TResult> {
      return fn
    },
    revalidateTag(tag: string): void {
      revalidatedTags.push(tag)
    },
    revalidatePath(path: string, type?: 'page' | 'layout'): void {
      revalidatedPaths.push({ path, type })
    },
  }

  return { driver, revalidatedTags, revalidatedPaths }
}

const SCHEMA = defineCacheSchema({
  articles: { ttl: 300 },
  sitemap: { dependsOn: ['articles'] as const },
})

const EFFECTS = defineModelEffects<'Article', keyof typeof SCHEMA>({
  Article: ['articles'],
})

describe('dryRun and Logger', () => {
  it('mode dryRun tidak memanggil driver.revalidateTag dan mencatat ke logger', () => {
    const { driver, revalidatedTags } = createMockDriver()
    const dryRunLogs: { action: string; affected: string[] }[] = []

    const { invalidateModel } = createCacheModule(SCHEMA, EFFECTS, {
      driver,
      dryRun: true,
      logger: {
        dryRun: (action, affected) => {
          dryRunLogs.push({ action, affected })
        },
      },
    })

    invalidateModel('Article')

    // revalidateTag di driver TIDAK boleh terpanggil
    assert.equal(revalidatedTags.length, 0)

    // logger.dryRun HARUS terpanggil dengan daftar affected
    assert.equal(dryRunLogs.length, 1)
    assert.equal(dryRunLogs[0].action, 'invalidate')
    assert.ok(dryRunLogs[0].affected.includes('articles'))
    assert.ok(dryRunLogs[0].affected.includes('sitemap'))
  })

  it('logger.invalidate dipanggil saat invalidasi normal', () => {
    const { driver, revalidatedTags } = createMockDriver()
    const invalidatedLogged: string[][] = []

    const { invalidate } = createCacheModule(SCHEMA, EFFECTS, {
      driver,
      logger: {
        invalidate: (names) => {
          invalidatedLogged.push(names)
        },
      },
    })

    invalidate('articles')

    assert.ok(revalidatedTags.includes('cache:articles'))
    assert.ok(revalidatedTags.includes('cache:sitemap'))
    assert.equal(invalidatedLogged.length, 1)
    assert.ok(invalidatedLogged[0].includes('articles'))
    assert.ok(invalidatedLogged[0].includes('sitemap'))
  })

  it('wrap adalah alias untuk cached', () => {
    const { driver } = createMockDriver()
    const module = createCacheModule(SCHEMA, EFFECTS, { driver })

    assert.equal(module.wrap, module.cached)
  })

  it('revalidatePath meneruskan ke driver.revalidatePath', () => {
    const { driver, revalidatedPaths } = createMockDriver()
    const { revalidatePath } = createCacheModule(SCHEMA, EFFECTS, { driver })

    revalidatePath('/berita', 'page')
    revalidatePath('/dashboard', 'layout')

    assert.equal(revalidatedPaths.length, 2)
    assert.deepEqual(revalidatedPaths[0], { path: '/berita', type: 'page' })
    assert.deepEqual(revalidatedPaths[1], { path: '/dashboard', type: 'layout' })
  })
})
