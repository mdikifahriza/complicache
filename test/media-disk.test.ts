import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DiskStorageEngine } from '../src/media/drivers/disk'

describe('Disk Storage Engine', () => {
  const testDir = path.join(process.cwd(), '.tmp-test-storage')
  let disk: DiskStorageEngine

  before(async () => {
    await fs.mkdir(testDir, { recursive: true })
    disk = new DiskStorageEngine({ baseDir: testDir })
  })

  after(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  it('menyimpan dan membaca file secara utuh (status 200 + ETag)', async () => {
    const key = 'test/2026/01/hello.txt'
    const content = Buffer.from('Hello Complicache Media!')

    await disk.put(key, content, { contentType: 'text/plain' })

    const exists = await disk.exists(key)
    assert.equal(exists, true)

    const result = await disk.read(key)
    assert.equal(result.status, 200)
    assert.equal(result.contentType, 'text/plain')
    assert.equal(result.contentLength, content.length)
    assert.equal(result.body.toString('utf8'), 'Hello Complicache Media!')
    assert.ok(result.etag)
  })

  it('mendukung HTTP Range request untuk streaming video (status 206)', async () => {
    const key = 'test/2026/01/video.mp4'
    const dummyVideo = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz') // 36 byte

    await disk.put(key, dummyVideo, { contentType: 'video/mp4' })

    // Minta byte 10 sampai 19 (10 byte)
    const result = await disk.read(key, 'bytes=10-19')
    assert.equal(result.status, 206)
    assert.equal(result.contentRange, 'bytes 10-19/36')
    assert.equal(result.contentLength, 10)
    assert.equal(result.body.toString('utf8'), 'abcdefghij')
  })

  it('menghapus file dari disk', async () => {
    const key = 'test/2026/01/hapus.txt'
    await disk.put(key, Buffer.from('hapus saya'), { contentType: 'text/plain' })
    assert.equal(await disk.exists(key), true)

    await disk.delete(key)
    assert.equal(await disk.exists(key), false)
  })
})
