import test from 'node:test'
import assert from 'node:assert/strict'
import { createPrismaInvalidator, createCacheModule, createMemoryDriver } from '../src/index'

function spy() {
  const calls: unknown[][] = []
  return { calls, target: { invalidateModel: (...a: unknown[]) => void calls.push(a) } }
}
const run = (
  ext: ReturnType<typeof createPrismaInvalidator>,
  model: string,
  operation: string,
  query: (a: any) => Promise<any> = async () => 'ok'
) => ext.query.$allModels.$allOperations({ model, operation, args: {}, query })

test('mutasi sukses -> invalidateModel; hasil query dikembalikan apa adanya', async () => {
  const { calls, target } = spy()
  const ext = createPrismaInvalidator(target)
  for (const op of ['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']) {
    assert.deepEqual(await run(ext, 'News', op, async () => ({ op })), { op })
  }
  assert.equal(calls.length, 7)
  assert.deepEqual(calls[0], ['News'])
})

test('operasi baca tidak memicu invalidasi', async () => {
  const { calls, target } = spy()
  const ext = createPrismaInvalidator(target)
  for (const op of ['findMany', 'findUnique', 'findFirst', 'count', 'aggregate', 'groupBy']) await run(ext, 'News', op)
  assert.equal(calls.length, 0)
})

test('mutasi yang gagal (query melempar) tidak menginvalidasi', async () => {
  const { calls, target } = spy()
  const ext = createPrismaInvalidator(target)
  await assert.rejects(run(ext, 'News', 'create', async () => { throw new Error('db') }), /db/)
  assert.equal(calls.length, 0)
})

test("model tak terdaftar: default 'warn' tidak membuat mutasi gagal; 'throw' melempar; 'ignore' diam", async () => {
  const cache = createCacheModule({ news: { ttl: 5 } }, { News: ['news'] }, { driver: createMemoryDriver() })
  const warns: string[] = []
  const orig = console.warn
  console.warn = (m: string) => void warns.push(m)
  try {
    const ext = createPrismaInvalidator(cache)
    assert.equal(await run(ext, 'Ghost', 'create', async () => 42), 42)
    await run(ext, 'Ghost', 'create')
    assert.equal(warns.length, 1, 'warn hanya sekali per model')

    assert.equal(await run(createPrismaInvalidator(cache, { onError: 'ignore' }), 'Ghost', 'create', async () => 1), 1)
    assert.equal(warns.length, 1)
    await assert.rejects(run(createPrismaInvalidator(cache, { onError: 'throw' }), 'Ghost', 'create'), /tidak terdaftar/)
  } finally {
    console.warn = orig
  }
})

test('opsi: operations kustom & invalidate mode diteruskan', async () => {
  const { calls, target } = spy()
  const ext = createPrismaInvalidator(target, { operations: ['create'], invalidate: { mode: 'now' } })
  await run(ext, 'News', 'update')
  assert.equal(calls.length, 0)
  await run(ext, 'News', 'create')
  assert.deepEqual(calls[0], ['News', { mode: 'now' }])
})

test('reinvalidateAfterMs: invalidasi kedua setelah jeda', async () => {
  const { calls, target } = spy()
  const ext = createPrismaInvalidator(target, { reinvalidateAfterMs: 20 })
  await run(ext, 'News', 'create')
  assert.equal(calls.length, 1)
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(calls.length, 2)
})

test('end-to-end dengan module: mutasi lewat extension mematikan cache + dependan', async () => {
  const cache = createCacheModule(
    { news: { ttl: 300 }, sitemap: { ttl: 300, dependsOn: ['news'] } },
    { News: ['news'] },
    { driver: createMemoryDriver() }
  )
  let n = 0
  const getSitemap = cache.wrap('sitemap', [], async () => ++n)
  assert.equal(await getSitemap(), 1)
  assert.equal(await getSitemap(), 1)
  await run(createPrismaInvalidator(cache), 'News', 'create')
  assert.equal(await getSitemap(), 2)
})
