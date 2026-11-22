import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createMediaStorage } from '../src/media/storage'
import { MediaValidationError } from '../src/media/validator'

describe('createMediaStorage Instance', () => {
  const testDir = path.join(process.cwd(), '.tmp-test-mediastorage')
  let media: ReturnType<typeof createMediaStorage>

  before(async () => {
    await fs.mkdir(testDir, { recursive: true })
    media = createMediaStorage({
      driver: 'disk',
      disk: { baseDir: testDir },
    })
  })

  after(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  it('save() berhasil menyimpan dokumen dan mengembalikan metadata lengkap', async () => {
    const pdfContent = Buffer.from('%PDF-1.4\nObjek dokumen complicache\n%%EOF', 'utf8')
    const result = await media.save(pdfContent, {
      folder: 'dokumen',
      originalName: 'laporan-tahunan.pdf',
    })

    assert.equal(result.kind, 'DOCUMENT')
    assert.equal(result.originalName, 'laporan-tahunan.pdf')
    assert.match(result.key, /^dokumen\/\d{4}\/\d{2}\/[0-9a-f]{16}\.pdf$/)
    assert.equal(result.url, `/media/${result.key}`)

    const exists = await media.exists(result.key)
    assert.equal(exists, true)

    // Hapus file
    await media.delete(result.key)
    assert.equal(await media.exists(result.key), false)
  })

  it('save() melempar MediaValidationError jika file kosong', async () => {
    await assert.rejects(
      async () => {
        await media.save(Buffer.alloc(0))
      },
      (err: any) => {
        assert.ok(err instanceof MediaValidationError)
        assert.match(err.message, /tidak boleh kosong/)
        return true
      },
    )
  })

  it('save() melempar MediaValidationError jika ukuran melebihi batas', async () => {
    const buffer = Buffer.alloc(1024)
    await assert.rejects(
      async () => {
        await media.save(buffer, { maxBytes: 500 })
      },
      (err: any) => {
        assert.ok(err instanceof MediaValidationError)
        assert.match(err.message, /melebihi batas/)
        return true
      },
    )
  })
})
