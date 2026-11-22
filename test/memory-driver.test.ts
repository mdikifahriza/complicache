import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryDriver } from '../src/drivers/memory'
import { createCacheModule } from '../src/core/module'
import { defineCacheSchema, defineModelEffects } from '../src/builders'

describe('createMemoryDriver', () => {
  it('menyimpan hasil query di memori (cache hit)', async () => {
    const driver = createMemoryDriver()
    let executionCount = 0

    const cachedFn = driver.wrap(
      async (id: string) => {
        executionCount++
        return { id, name: `User ${id}` }
      },
      {
        name: 'user',
        keyParts: ['cache:user'],
        tags: ['cache:user'],
        scope: 'default',
        ttl: 60,
      }
    )

    const res1 = await cachedFn('1')
    assert.equal(executionCount, 1)
    assert.deepEqual(res1, { id: '1', name: 'User 1' })

    // Call kedua dengan ID yang sama -> hit dari memori
    const res2 = await cachedFn('1')
    assert.equal(executionCount, 1)
    assert.deepEqual(res2, { id: '1', name: 'User 1' })

    // Call dengan ID berbeda -> eksekusi baru
    const res3 = await cachedFn('2')
    assert.equal(executionCount, 2)
    assert.deepEqual(res3, { id: '2', name: 'User 2' })
  })

  it('revalidateTag menghapus entri dari memori', async () => {
    const driver = createMemoryDriver()
    let count = 0

    const cachedFn = driver.wrap(
      async () => {
        count++
        return `count-${count}`
      },
      {
        name: 'test',
        keyParts: ['cache:test'],
        tags: ['cache:test'],
        scope: 'default',
      }
    )

    const val1 = await cachedFn()
    assert.equal(val1, 'count-1')
    assert.equal(count, 1)

    // Hit dari cache
    const val2 = await cachedFn()
    assert.equal(val2, 'count-1')
    assert.equal(count, 1)

    // Revalidate tag
    driver.revalidateTag('cache:test')

    // Harus fetch ulang
    const val3 = await cachedFn()
    assert.equal(val3, 'count-2')
    assert.equal(count, 2)
  })

  it('bekerja mulus dengan createCacheModule', async () => {
    const schema = defineCacheSchema({
      products: { ttl: 300 },
      inventory: { dependsOn: ['products'] as const },
    })

    const effects = defineModelEffects<'Product', keyof typeof schema>({
      Product: ['products'],
    })

    const driver = createMemoryDriver()
    const { wrap, invalidateModel } = createCacheModule(schema, effects, {
      driver,
    })

    let fetchCount = 0
    const getProducts = wrap('products', [], async () => {
      fetchCount++
      return ['Product A', 'Product B']
    })

    const p1 = await getProducts()
    assert.equal(fetchCount, 1)
    assert.deepEqual(p1, ['Product A', 'Product B'])

    const p2 = await getProducts()
    assert.equal(fetchCount, 1)

    // Invalidate via model
    invalidateModel('Product')

    const p3 = await getProducts()
    assert.equal(fetchCount, 2)
  })
})
