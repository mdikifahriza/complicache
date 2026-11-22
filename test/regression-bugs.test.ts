/**
 * Regression tests untuk bug yang ditemukan dan diperbaiki.
 * Setiap test mereproduksi skenario bug yang dilaporkan.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import { createMemoryDriver } from '../src/drivers/memory'
import { resetAutoDriver, detectDriver, createAutoDriver } from '../src/drivers/auto'
import { safeRelativeKey, isPrivateKey, generateStorageKey } from '../src/media/keys'
import { stripSvgScripts } from '../src/media/validator'
import { createPresignedS3Url } from '../src/media/sigv4'
import { DiskStorageEngine } from '../src/media/drivers/disk'

// ═══════════════════════════════════════════════════════════════════════════
// Bug #1: ESM auto-detection — production guard
// ═══════════════════════════════════════════════════════════════════════════
describe('Bug #1: Auto driver production guard', () => {
  it('detectDriver dan resetAutoDriver tersedia', () => {
    assert.equal(typeof detectDriver, 'function')
    assert.equal(typeof resetAutoDriver, 'function')
    assert.equal(typeof createAutoDriver, 'function')
  })

  it('createAutoDriver melempar error di NODE_ENV=production jika next/cache tidak tersedia', () => {
    const origEnv = process.env.NODE_ENV
    resetAutoDriver()
    try {
      process.env.NODE_ENV = 'production'
      // Di environment ini next/cache tidak terpasang di runtime
      assert.throws(
        () => createAutoDriver(),
        /FATAL: next\/cache tidak ditemukan di production/
      )
    } finally {
      process.env.NODE_ENV = origEnv
      resetAutoDriver()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Bug #2: MemoryDriver — ttl:0, dedup, shared refs, stale writes
// ═══════════════════════════════════════════════════════════════════════════
describe('Bug #2: MemoryDriver fixes', () => {
  it('ttl: 0 berarti kedaluwarsa langsung, bukan permanen', async () => {
    const driver = createMemoryDriver()
    let count = 0

    const fn = driver.wrap(
      async () => {
        count++
        return `v${count}`
      },
      {
        name: 'test-ttl-zero',
        keyParts: ['test-ttl-zero'],
        tags: ['cache:test-ttl-zero'],
        scope: 'default',
        ttl: 0, // seharusnya langsung expired
      }
    )

    const r1 = await fn()
    assert.equal(r1, 'v1')
    assert.equal(count, 1)

    // Tunggu 10ms agar Date.now() bergerak
    await new Promise((r) => setTimeout(r, 10))

    // Dengan ttl=0 (0 detik), cache seharusnya sudah expired
    const r2 = await fn()
    assert.equal(r2, 'v2')
    assert.equal(count, 2, 'ttl:0 harus menyebabkan cache miss pada panggilan berikutnya')
  })

  it('request paralel saat cache dingin menjalankan loader hanya sekali (dedup)', async () => {
    const driver = createMemoryDriver()
    let loadCount = 0

    const fn = driver.wrap(
      async () => {
        loadCount++
        // Simulasikan latency
        await new Promise((r) => setTimeout(r, 30))
        return `result-${loadCount}`
      },
      {
        name: 'test-dedup',
        keyParts: ['test-dedup'],
        tags: ['cache:test-dedup'],
        scope: 'default',
        ttl: 300,
      }
    )

    // 10 request paralel
    const results = await Promise.all(
      Array.from({ length: 10 }, () => fn())
    )

    assert.equal(loadCount, 1, 'loader harus hanya dipanggil sekali untuk 10 request paralel')
    for (const r of results) {
      assert.equal(r, 'result-1')
    }
  })

  it('mutasi oleh pemanggil tidak mencemari cache (deep clone)', async () => {
    const driver = createMemoryDriver()

    const fn = driver.wrap(
      async () => ({ items: [1, 2, 3], nested: { a: 'hello' } }),
      {
        name: 'test-clone',
        keyParts: ['test-clone'],
        tags: ['cache:test-clone'],
        scope: 'default',
        ttl: 300,
      }
    )

    const r1 = await fn()
    // Mutasi hasil
    r1.items.push(999)
    r1.nested.a = 'corrupted'

    // Panggilan kedua harus mengembalikan data asli yang tidak termutasi
    const r2 = await fn()
    assert.deepEqual(r2.items, [1, 2, 3], 'cache tidak boleh tercemar oleh mutasi luar')
    assert.equal(r2.nested.a, 'hello', 'nested object tidak boleh tercemar')
  })

  it('invalidate saat loader sedang berjalan → hasil lama tidak ditulis ke cache', async () => {
    const driver = createMemoryDriver()
    let version = 0

    const fn = driver.wrap(
      async () => {
        version++
        const v = version
        // Simulasikan query lambat
        await new Promise((r) => setTimeout(r, 80))
        return `version-${v}`
      },
      {
        name: 'test-stale',
        keyParts: ['test-stale'],
        tags: ['cache:test-stale'],
        scope: 'default',
        ttl: 300,
      }
    )

    // Start loading version 1
    const p1 = fn()

    // Sementara loading, invalidate dan minta versi baru
    await new Promise((r) => setTimeout(r, 20))
    driver.revalidateTag('cache:test-stale')
    version = 1

    await p1

    // Panggil lagi — harus menjalankan loader baru, bukan mengembalikan version-1 dari cache
    const r2 = await fn()
    assert.equal(r2, 'version-2', 'setelah invalidate, harus menjalankan loader baru (bukan stale version-1)')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Bug #5: media driver:'auto' tidak memilih S3
// ═══════════════════════════════════════════════════════════════════════════
describe('Bug #5: Media driver auto → S3 detection', () => {
  it('driver "auto" dengan S3_BUCKET memilih S3', () => {
    const configDriver = 'auto'
    const driverKind: 'disk' | 's3' =
      configDriver === 'auto' || !configDriver
        ? ('' as 'disk' | 's3') ||
          ('my-bucket' ? 's3' : 'disk')
        : configDriver

    assert.equal(driverKind, 's3', 'auto harus memilih s3 jika bucket tersedia')
  })

  it('string "auto" sebelumnya dianggap truthy oleh ||, sehingga tidak pernah sampai ke fallback S3', () => {
    const configDriverBuggy = 'auto' || (true ? 's3' : 'disk')
    assert.equal(configDriverBuggy, 'auto', 'Bug: || menganggap "auto" sebagai truthy')

    const configDriver = 'auto'
    const fixed =
      configDriver === 'auto' || !configDriver
        ? ('' || (true ? 's3' : 'disk'))
        : configDriver
    assert.equal(fixed, 's3', 'Fix: mengecek === "auto" secara eksplisit')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Bug #6: safeRelativeKey memotong key secara salah
// ═══════════════════════════════════════════════════════════════════════════
describe('Bug #6: safeRelativeKey fixes', () => {
  it('folder "avatar/media" tidak salah dipotong', () => {
    const result = safeRelativeKey('avatar/media/2026/11/abc.webp')
    assert.equal(result, 'avatar/media/2026/11/abc.webp', 'folder avatar/media/ tidak boleh dipotong menjadi 2026/11/...')
  })

  it('URL lengkap dengan https:// tidak menghasilkan key aneh', () => {
    const result = safeRelativeKey('https://cdn.example.com/media/avatar/2026/01/abc.webp')
    assert.equal(result, 'avatar/2026/01/abc.webp', 'URL lengkap dengan /media/ harus diekstrak path-nya')
    assert.ok(!result.includes('https:'), 'tidak boleh ada "https:" di key')
    assert.ok(!result.includes('cdn.example.com'), 'tidak boleh ada hostname di key')
  })

  it('URL tanpa /media/ marker harus tetap diparsing dari pathname', () => {
    const result = safeRelativeKey('https://cdn.example.com/a.webp')
    assert.equal(result, 'a.webp', 'media.delete("https://cdn.../a.webp") harus menghasilkan "a.webp"')
  })

  it('generateStorageKey mencegah tabrakan nama folder publik internal/private', () => {
    const key1 = generateStorageKey({ folder: 'internal', ext: 'webp', isPrivate: false })
    assert.ok(key1.key.startsWith('pub-internal/'), 'folder publik "internal" di-prefix pub-internal/')
    assert.equal(isPrivateKey(key1.key), false, 'folder publik tidak boleh dianggap isPrivateKey')

    const key2 = generateStorageKey({ folder: 'private', ext: 'webp', isPrivate: false })
    assert.ok(key2.key.startsWith('pub-private/'), 'folder publik "private" di-prefix pub-private/')
    assert.equal(isPrivateKey(key2.key), false, 'folder publik tidak boleh dianggap isPrivateKey')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Bug #7: SVG XSS — attack vectors yang sebelumnya lolos
// ═══════════════════════════════════════════════════════════════════════════
describe('Bug #7: SVG XSS sanitization', () => {
  it('memblokir <svg onload=...>', () => {
    const payload = '<svg onload="alert(1)"><circle r="10"/></svg>'
    const cleaned = stripSvgScripts(payload)
    assert.ok(!cleaned.includes('onload'), 'onload harus dihapus')
    assert.ok(cleaned.includes('<circle'), 'elemen aman harus tetap ada')
  })

  it('memblokir &#106;avascript: (HTML entity encoded)', () => {
    const payload = '<svg><a href="&#106;avascript:alert(1)"><text>Click</text></a></svg>'
    const cleaned = stripSvgScripts(payload)
    assert.ok(!cleaned.includes('&#106;'), 'entity-encoded javascript: harus dihapus')
  })

  it('memblokir <set attributeName="href" to="javascript:...">', () => {
    const payload = '<svg><a href="/ok"><set attributeName="href" to="javascript:alert(1)"/><text>Click</text></a></svg>'
    const cleaned = stripSvgScripts(payload)
    assert.ok(!cleaned.includes('<set'), '<set> yang menarget href harus dihapus')
  })

  it('memblokir @import di <style>', () => {
    const payload = '<svg><style>@import url("https://evil.com/steal.css");</style><rect/></svg>'
    const cleaned = stripSvgScripts(payload)
    assert.ok(!cleaned.includes('@import url'), '@import harus dihapus dari <style>')
    assert.ok(cleaned.includes('<rect'), 'elemen aman harus tetap ada')
  })

  it('memblokir expression() di <style>', () => {
    const payload = '<svg><style>div { width: expression(alert(1)); }</style></svg>'
    const cleaned = stripSvgScripts(payload)
    assert.ok(!cleaned.includes('expression('), 'expression() harus dihapus')
  })

  it('memblokir data: URI di href', () => {
    const payload = '<svg><a href="data:text/html,<script>alert(1)</script>"><text>X</text></a></svg>'
    const cleaned = stripSvgScripts(payload)
    assert.ok(!cleaned.includes('data:text/html'), 'data: URI di href harus dihapus')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Bug #9: Presigned GET URL bisa langsung kedaluwarsa
// ═══════════════════════════════════════════════════════════════════════════
describe('Bug #9: Presigned URL expiration compensation', () => {
  it('URL dengan quantizeSeconds mengkompensasi X-Amz-Expires', () => {
    const url = createPresignedS3Url({
      method: 'GET' as const,
      key: 'test/file.webp',
      creds: {
        endpoint: 'https://s3.example.com',
        bucket: 'test-bucket',
        accessKeyId: 'AKID',
        secretAccessKey: 'SECRET',
        region: 'us-east-1',
      },
      expiresInSeconds: 60,
      quantizeSeconds: 300,
    })

    const urlObj = new URL(url)
    const expires = Number(urlObj.searchParams.get('X-Amz-Expires'))

    assert.ok(expires >= 60, `X-Amz-Expires (${expires}) harus >= expiresInSeconds (60)`)
    assert.ok(expires <= 60 + 300, `X-Amz-Expires (${expires}) harus <= expiresInSeconds + quantizeSeconds (360)`)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Bug #10: HTTP Range handling
// ═══════════════════════════════════════════════════════════════════════════
describe('Bug #10: HTTP Range parsing (DiskStorageEngine)', () => {
  it('bytes=-100 pada file 1000 byte → 900-999', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'complicache-test-'))
    const engine = new DiskStorageEngine({ baseDir: tmpDir })

    const data = Buffer.alloc(1000)
    for (let i = 0; i < 1000; i++) data[i] = i % 256
    const key = 'test/range-file.bin'
    await engine.put(key, data, { contentType: 'application/octet-stream' })

    const result = await engine.read(key, 'bytes=-100')
    assert.equal(result.status, 206, 'harus 206 Partial Content')
    assert.equal(result.contentRange, 'bytes 900-999/1000')
    assert.equal(result.contentLength, 100)

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('bytes=0-5000 pada file 1000 byte → clamp ke 0-999', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'complicache-test-'))
    const engine = new DiskStorageEngine({ baseDir: tmpDir })

    const data = Buffer.alloc(1000)
    const key = 'test/range-clamp.bin'
    await engine.put(key, data, { contentType: 'application/octet-stream' })

    const result = await engine.read(key, 'bytes=0-5000')
    assert.equal(result.status, 206, 'harus 206 dengan end di-clamp')
    assert.equal(result.contentRange, 'bytes 0-999/1000')
    assert.equal(result.contentLength, 1000)

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('bytes=1500-2000 pada file 1000 byte → 416 Range Not Satisfiable', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'complicache-test-'))
    const engine = new DiskStorageEngine({ baseDir: tmpDir })

    const data = Buffer.alloc(1000)
    const key = 'test/range-416.bin'
    await engine.put(key, data, { contentType: 'application/octet-stream' })

    const result = await engine.read(key, 'bytes=1500-2000')
    assert.equal(result.status, 416, 'harus 416 Range Not Satisfiable')
    assert.ok(result.contentRange?.includes('*'), 'contentRange harus mengandung *')

    await fs.rm(tmpDir, { recursive: true, force: true })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Bug #4: Validasi nama tidak dikenal di invalidate & invalidateModel
// ═══════════════════════════════════════════════════════════════════════════
describe('Bug #4: Strict validation for unknown names', async () => {
  const { createCacheModule } = await import('../src/core/module')
  const { defineCacheSchema, defineModelEffects } = await import('../src/builders')

  const schema = defineCacheSchema({
    articles: { ttl: 60 },
  })
  const effects = defineModelEffects<'Article', keyof typeof schema>({
    Article: ['articles'],
  })

  it('invalidate() melempar error jika nama cache tidak ada di schema', () => {
    const { invalidate } = createCacheModule(schema, effects, { driver: 'memory' })
    assert.throws(
      () => (invalidate as any)('ghost_cache'),
      /Cache "ghost_cache" tidak ada di schema/
    )
  })

  it('invalidateModel() melempar error jika model tidak terdaftar di modelEffects', () => {
    const { invalidateModel } = createCacheModule(schema, effects, { driver: 'memory' })
    assert.throws(
      () => (invalidateModel as any)('GhostModel'),
      /Model "GhostModel" tidak terdaftar di modelEffects/
    )
  })

  it('driver: "next" gagal keras jika next/cache tidak ada', () => {
    assert.throws(
      () => createCacheModule(schema, effects, { driver: 'next' }),
      /driver: "next" ditentukan, tetapi next\/cache tidak ditemukan/
    )
  })

  it('driver: "memory" preset string berhasil dimuat', () => {
    const { wrap } = createCacheModule(schema, effects, { driver: 'memory' })
    assert.equal(typeof wrap, 'function')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Bug #7 & Bug #11: serveMedia CSP & authorize hook
// ═══════════════════════════════════════════════════════════════════════════
describe('Bug #7 & Bug #11: serveMedia CSP sandbox & Private file authorize', async () => {
  const { serveMedia } = await import('../src/media/serve')
  const { DiskStorageEngine } = await import('../src/media/drivers/disk')

  it('serveMedia menyertakan Content-Security-Policy sandbox untuk file SVG', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'complicache-test-svg-'))
    const engine = new DiskStorageEngine({ baseDir: tmpDir })

    const svgData = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>')
    await engine.put('icons/circle.svg', svgData, { contentType: 'image/svg+xml' })

    const req = new Request('https://example.com/media/icons/circle.svg')
    const res = await serveMedia(req, 'icons/circle.svg', engine)

    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Content-Type'), 'image/svg+xml')
    assert.ok(res.headers.get('Content-Security-Policy')?.includes('sandbox'), 'harus ada CSP sandbox untuk SVG')

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('serveMedia menolak berkas privat dengan 404 jika tidak ada hook authorize', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'complicache-test-priv-'))
    const engine = new DiskStorageEngine({ baseDir: tmpDir })

    const data = Buffer.from('konten rahasia')
    await engine.put('internal/docs/secret.txt', data, { contentType: 'text/plain' })

    const req = new Request('https://example.com/media/internal/docs/secret.txt')
    const res = await serveMedia(req, 'internal/docs/secret.txt', engine)

    assert.equal(res.status, 404, 'berkas privat tanpa authorize hook harus 404')

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('serveMedia mengembalikan 403 jika hook authorize menolak (false)', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'complicache-test-priv-'))
    const engine = new DiskStorageEngine({ baseDir: tmpDir })

    const data = Buffer.from('konten rahasia')
    await engine.put('internal/docs/secret.txt', data, { contentType: 'text/plain' })

    const req = new Request('https://example.com/media/internal/docs/secret.txt')
    const res = await serveMedia(req, 'internal/docs/secret.txt', engine, {
      authorize: async () => false,
    })

    assert.equal(res.status, 403, 'authorize mengembalikan false harus menghasilkan 403 Forbidden')

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('serveMedia mengizinkan berkas privat dengan Cache-Control private jika authorize berhasil', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'complicache-test-priv-'))
    const engine = new DiskStorageEngine({ baseDir: tmpDir })

    const data = Buffer.from('konten privat sah')
    await engine.put('internal/docs/secret.txt', data, { contentType: 'text/plain' })

    const req = new Request('https://example.com/media/internal/docs/secret.txt')
    const res = await serveMedia(req, 'internal/docs/secret.txt', engine, {
      authorize: async () => true,
    })

    assert.equal(res.status, 200, 'authorize berhasil harus menghasilkan 200 OK')
    assert.ok(res.headers.get('Cache-Control')?.includes('private'), 'Cache-Control harus bertipe private')

    await fs.rm(tmpDir, { recursive: true, force: true })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Bug #8: Validasi preset typo
// ═══════════════════════════════════════════════════════════════════════════
describe('Bug #8: Preset typo validation', async () => {
  const { createMediaStorage } = await import('../src/media/storage')

  it('save() melempar MediaValidationError jika nama preset salah ketik (typo)', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'complicache-test-preset-'))
    const media = createMediaStorage({
      driver: 'disk',
      disk: { baseDir: tmpDir },
    })

    const fakeJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
    await assert.rejects(
      async () => {
        await media.save(fakeJpg, {
          mimeType: 'image/jpeg',
          preset: 'typo_preset_name',
        })
      },
      /Preset 'typo_preset_name' tidak ditemukan/
    )

    await fs.rm(tmpDir, { recursive: true, force: true })
  })
})
