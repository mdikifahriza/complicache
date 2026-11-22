import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DiskStorageEngine } from '../src/media/drivers/disk'
import { serveMedia } from '../src/media/serve'
import { CACHE_POLICIES } from '../src/media/constants'

describe('serveMedia Route Handler Helper', () => {
  const testDir = path.join(process.cwd(), '.tmp-test-serve')
  let disk: DiskStorageEngine

  before(async () => {
    await fs.mkdir(testDir, { recursive: true })
    disk = new DiskStorageEngine({ baseDir: testDir })

    // Buat file publik
    await disk.put('galeri/foto.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02]), {
      contentType: 'image/jpeg',
    })

    // Buat file privat
    await disk.put('internal/surat/rahasia.pdf', Buffer.from('%PDF-1.4\ncontent', 'utf8'), {
      contentType: 'application/pdf',
    })
  })

  after(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  it('melayani berkas publik dengan header Cache-Control immutable 1 tahun', async () => {
    const req = new Request('http://localhost:3000/media/galeri/foto.jpg')
    const res = await serveMedia(req, 'galeri/foto.jpg', disk)

    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Content-Type'), 'image/jpeg')
    assert.equal(res.headers.get('Cache-Control'), CACHE_POLICIES.immutable)
    assert.equal(res.headers.get('Accept-Ranges'), 'bytes')
    assert.ok(res.headers.get('ETag'))
  })

  it('mengembalikan status 304 Not Modified jika ETag klien cocok', async () => {
    const req1 = new Request('http://localhost:3000/media/galeri/foto.jpg')
    const res1 = await serveMedia(req1, 'galeri/foto.jpg', disk)
    const etag = res1.headers.get('ETag')!

    const req2 = new Request('http://localhost:3000/media/galeri/foto.jpg', {
      headers: { 'If-None-Match': etag },
    })
    const res2 = await serveMedia(req2, 'galeri/foto.jpg', disk)

    assert.equal(res2.status, 304)
    assert.equal(await res2.text(), '')
  })

  it('secara ketat menolak berkas privat (internal/) dengan status 404', async () => {
    const req = new Request('http://localhost:3000/media/internal/surat/rahasia.pdf')
    const res = await serveMedia(req, 'internal/surat/rahasia.pdf', disk)

    assert.equal(res.status, 404)
    assert.equal(await res.text(), 'Media Not Found')
  })

  it('mengembalikan status 404 bila berkas tidak ada', async () => {
    const req = new Request('http://localhost:3000/media/tidak-ada.jpg')
    const res = await serveMedia(req, 'tidak-ada.jpg', disk)

    assert.equal(res.status, 404)
  })
})
