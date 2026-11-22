import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createMediaStorage, parseDuration, sweepStorage } from '../src/media'
import type { StorageEngine } from '../src/media'

const DAY = 86_400_000

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-sweep-'))
  const media = createMediaStorage({ driver: 'disk', disk: { baseDir: dir } })
  const put = async (key: string, ageMs: number) => {
    await media.storage.put(key, Buffer.from('xxxx'), { contentType: 'text/plain' })
    const t = new Date(Date.now() - ageMs)
    await fs.utimes(path.join(dir, key), t, t)
  }
  return { dir, media, put, cleanup: () => fs.rm(dir, { recursive: true, force: true }) }
}

test('parseDuration', () => {
  assert.equal(parseDuration('30m'), 1_800_000)
  assert.equal(parseDuration('24h'), DAY)
  assert.equal(parseDuration('7d'), 7 * DAY)
  assert.equal(parseDuration(5000), 5000)
  assert.throws(() => parseDuration('abc'))
  assert.throws(() => parseDuration(-1))
})

test('sweep: dryRun default, tidak menghapus; mengklasifikasi dengan benar', async () => {
  const f = await fixture()
  try {
    await f.put('avatar/2026/01/old-orphan.webp', 3 * DAY)
    await f.put('avatar/2026/01/old-used.webp', 3 * DAY)
    await f.put('avatar/2026/02/new-orphan.webp', 60_000) // masih masa tenggang
    await f.put('internal/doc/2026/01/priv.pdf', 3 * DAY) // privat
    await f.put('avatar/2026/01/x.webp.123.abc.tmp', 3 * DAY) // sisa tmp

    const r = await f.media.sweep({ olderThan: '24h', isReferenced: (k) => k.endsWith('old-used.webp') })
    assert.equal(r.dryRun, true)
    assert.deepEqual(r.orphans, ['avatar/2026/01/old-orphan.webp'])
    assert.deepEqual(r.deleted, [])
    assert.equal(r.bytes, 4)
    assert.deepEqual(r.skipped, { recent: 1, referenced: 1, private: 1, temp: 1, unknownAge: 0 })
    assert.equal(r.scanned, 5)
    assert.equal(await f.media.exists('avatar/2026/01/old-orphan.webp'), true)
  } finally {
    await f.cleanup()
  }
})

test('sweep: dryRun:false menghapus hanya yatim; includePrivate membuka internal/', async () => {
  const f = await fixture()
  try {
    await f.put('a/2026/01/orphan.bin', 3 * DAY)
    await f.put('a/2026/01/used.bin', 3 * DAY)
    await f.put('internal/a/2026/01/priv.bin', 3 * DAY)
    const isReferenced = (k: string) => k.endsWith('used.bin')

    const r = await f.media.sweep({ olderThan: '24h', isReferenced, dryRun: false })
    assert.deepEqual(r.deleted, ['a/2026/01/orphan.bin'])
    assert.equal(await f.media.exists('a/2026/01/orphan.bin'), false)
    assert.equal(await f.media.exists('a/2026/01/used.bin'), true)
    assert.equal(await f.media.exists('internal/a/2026/01/priv.bin'), true)

    const r2 = await f.media.sweep({ olderThan: '24h', isReferenced, dryRun: false, includePrivate: true })
    assert.deepEqual(r2.deleted, ['internal/a/2026/01/priv.bin'])
  } finally {
    await f.cleanup()
  }
})

test('sweep: masa tenggang < 15 menit ditolak kecuali allowShortGrace', async () => {
  const f = await fixture()
  try {
    await assert.rejects(f.media.sweep({ olderThan: '5m', isReferenced: () => false }), /minimal 15 menit/)
    const r = await f.media.sweep({ olderThan: '5m', isReferenced: () => false, allowShortGrace: true })
    assert.equal(r.scanned, 0)
  } finally {
    await f.cleanup()
  }
})

test('sweep: isReferenced melempar -> batal total, tidak ada yang terhapus', async () => {
  const f = await fixture()
  try {
    await f.put('a/2026/01/1.bin', 3 * DAY)
    await f.put('a/2026/01/2.bin', 3 * DAY)
    let n = 0
    await assert.rejects(
      f.media.sweep({
        olderThan: '24h',
        dryRun: false,
        isReferenced: () => {
          if (++n === 2) throw new Error('db down')
          return false
        },
      }),
      /db down/
    )
    assert.equal(await f.media.exists('a/2026/01/1.bin'), true)
    assert.equal(await f.media.exists('a/2026/01/2.bin'), true)
  } finally {
    await f.cleanup()
  }
})

test('sweep: maxDelete membatasi penghapusan & menandai truncated', async () => {
  const f = await fixture()
  try {
    for (const n of ['1', '2', '3']) await f.put(`a/2026/01/${n}.bin`, 3 * DAY)
    const r = await f.media.sweep({ olderThan: '24h', isReferenced: () => false, dryRun: false, maxDelete: 2 })
    assert.equal(r.orphans.length, 3)
    assert.equal(r.deleted.length, 2)
    assert.equal(r.truncated, true)
  } finally {
    await f.cleanup()
  }
})

test('sweep: pagination (continuationToken) & lastModified tak diketahui dilewati', async () => {
  const old = new Date(Date.now() - 3 * DAY).toISOString()
  const pages: Record<string, { objects: any[]; next: string | null }> = {
    '': { objects: [{ key: 'p1/a', size: 1, lastModified: old }], next: 't2' },
    t2: { objects: [{ key: 'p2/b', size: 2, lastModified: old }, { key: 'p2/c', size: 3, lastModified: null }], next: null },
  }
  const deleted: string[] = []
  const fake: StorageEngine = {
    kind: 's3',
    put: async () => {},
    exists: async () => true,
    read: async () => { throw new Error('n/a') },
    getUrl: async () => '',
    delete: async (k) => void deleted.push(k),
    listObjects: async (o) => {
      const p = pages[o?.continuationToken ?? '']
      return { objects: p.objects, nextContinuationToken: p.next }
    },
  }
  const r = await sweepStorage(fake, { olderThan: '24h', isReferenced: () => false, dryRun: false })
  assert.deepEqual(r.deleted.sort(), ['p1/a', 'p2/b'])
  assert.equal(r.skipped.unknownAge, 1)
  assert.equal(r.bytes, 3)
})
