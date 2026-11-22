import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateStorageKey,
  isPrivateKey,
  safeRelativeKey,
  sanitizeFolder,
} from '../src/media/keys'

describe('Media Keys & Path Sanitization', () => {
  it('generateStorageKey menghasilkan key dengan format folder/yyyy/mm/<16-hex>.<ext>', () => {
    const fixedDate = new Date('2026-03-15T10:00:00Z')
    const { key, filename } = generateStorageKey({
      folder: 'avatar',
      ext: 'webp',
      date: fixedDate,
    })

    assert.match(key, /^avatar\/2026\/03\/[0-9a-f]{16}\.webp$/)
    assert.match(filename, /^[0-9a-f]{16}\.webp$/)
  })

  it('generateStorageKey untuk berkas privat menambahkan prefix internal/', () => {
    const fixedDate = new Date('2026-03-15T10:00:00Z')
    const { key } = generateStorageKey({
      folder: 'surat',
      ext: 'pdf',
      isPrivate: true,
      date: fixedDate,
    })

    assert.match(key, /^internal\/surat\/2026\/03\/[0-9a-f]{16}\.pdf$/)
  })

  it('isPrivateKey mendeteksi prefix internal/ dan private/', () => {
    assert.equal(isPrivateKey('internal/surat/2026/01/abc.pdf'), true)
    assert.equal(isPrivateKey('private/users/123/avatar.webp'), true)
    assert.equal(isPrivateKey('/internal/kas.xlsx'), true)
    assert.equal(isPrivateKey('galeri/2026/03/foto.webp'), false)
    assert.equal(isPrivateKey('avatar/user.png'), false)
  })

  it('safeRelativeKey mencegah serangan path traversal', () => {
    assert.equal(safeRelativeKey('../../etc/passwd'), '')
    assert.equal(safeRelativeKey('galeri/../../../secret.txt'), '')
    assert.equal(safeRelativeKey('/media/galeri/2026/foto.webp'), 'galeri/2026/foto.webp')
    assert.equal(safeRelativeKey('galeri/foto.webp?v=123'), 'galeri/foto.webp')
  })

  it('sanitizeFolder membersihkan karakter tidak aman', () => {
    assert.equal(sanitizeFolder('Galeri Foto & Berita!'), 'galeri-foto-berita')
    assert.equal(sanitizeFolder('///path//to//folder///'), 'path/to/folder')
    assert.equal(sanitizeFolder(''), 'umum')
  })
})
