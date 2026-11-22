import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DiskStorageEngine } from '../src/media/drivers/disk'

test('ETag berbeda untuk dua versi file dengan ukuran sama & mtime dipaksa sama', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-disk-'))
  try {
    const disk = new DiskStorageEngine({ baseDir: dir })
    await disk.put('a/x.txt', Buffer.from('AAAA'), { contentType: 'text/plain' })
    const first = await disk.read('a/x.txt')
    const t = new Date('2020-01-01T00:00:00.123Z')

    await disk.put('a/x.txt', Buffer.from('BBBB'), { contentType: 'text/plain' })
    await fs.utimes(path.join(dir, 'a/x.txt'), t, t)
    const second = await disk.read('a/x.txt')
    const third = await disk.read('a/x.txt') // tanpa menyentuh file di antaranya

    assert.equal(first.contentLength, second.contentLength)
    assert.notEqual(first.etag, second.etag)
    assert.equal(second.etag, third.etag, 'ETag stabil untuk file yang tidak berubah')
    assert.match(second.etag!, /^W\/"[0-9a-f]+(-[0-9a-f]+){3}"$/)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('put atomik: tidak meninggalkan file .tmp, range & 416 tetap jalan', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-disk-'))
  try {
    const disk = new DiskStorageEngine({ baseDir: dir })
    await disk.put('v.mp4', Buffer.from('0123456789'), { contentType: 'video/mp4' })
    assert.deepEqual(await fs.readdir(dir), ['v.mp4'])
    const r = await disk.read('v.mp4', 'bytes=2-5')
    assert.equal(r.status, 206)
    assert.equal(r.body.toString(), '2345')
    assert.equal(r.contentRange, 'bytes 2-5/10')
    assert.equal((await disk.read('v.mp4', 'bytes=50-60')).status, 416)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
