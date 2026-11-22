import test from 'node:test'
import assert from 'node:assert/strict'
import { matchesMagicBytes } from '../src/media/validator'

function ftyp(major: string, compat: string[] = [], pad = 0): Buffer {
  const brands = [major, '\0\0\0\0', ...compat].map((b) => Buffer.from(b, 'latin1'))
  const body = Buffer.concat(brands)
  const size = 8 + body.length
  const head = Buffer.alloc(8)
  head.writeUInt32BE(size, 0)
  head.write('ftyp', 4, 'latin1')
  return Buffer.concat([head, body, Buffer.alloc(pad)])
}

test('AVIF: terima avif/avis dan mif1+avif, tolak HEIC', () => {
  assert.equal(matchesMagicBytes(ftyp('avif', ['mif1', 'miaf']), 'image/avif'), true)
  assert.equal(matchesMagicBytes(ftyp('avis', ['msf1']), 'image/avif'), true)
  assert.equal(matchesMagicBytes(ftyp('mif1', ['miaf', 'avif']), 'image/avif'), true)
  assert.equal(matchesMagicBytes(ftyp('heic', ['mif1', 'heic']), 'image/avif'), false)
  assert.equal(matchesMagicBytes(ftyp('mif1', ['heic']), 'image/avif'), false)
  assert.equal(matchesMagicBytes(ftyp('isom', ['mp41']), 'image/avif'), false)
})

test('MP4: terima isom/mp42/dll, tolak M4A, HEIC, AVIF, QuickTime, 3GP', () => {
  for (const m of ['isom', 'mp42', 'mp41', 'avc1', 'iso5', 'dash']) {
    assert.equal(matchesMagicBytes(ftyp(m, ['isom']), 'video/mp4'), true, m)
  }
  // major tak dikenal tapi compatible brands menyatakan MP4
  assert.equal(matchesMagicBytes(ftyp('abcd', ['mp42']), 'video/mp4'), true)
  assert.equal(matchesMagicBytes(ftyp('abcd', ['zzzz']), 'video/mp4'), false)
  // M4A biasanya mencantumkan mp42/isom di compatible -> tetap harus ditolak
  assert.equal(matchesMagicBytes(ftyp('M4A ', ['M4A ', 'mp42', 'isom']), 'video/mp4'), false)
  assert.equal(matchesMagicBytes(ftyp('heic', ['mif1', 'heic']), 'video/mp4'), false)
  assert.equal(matchesMagicBytes(ftyp('avif', ['mif1']), 'video/mp4'), false)
  assert.equal(matchesMagicBytes(ftyp('qt  ', ['qt  ']), 'video/mp4'), false)
  assert.equal(matchesMagicBytes(ftyp('3gp4', ['isom']), 'video/mp4'), false)
})

test('buffer terpotong / bukan ISO BMFF ditolak tanpa melempar', () => {
  assert.equal(matchesMagicBytes(Buffer.from('....ftyp'), 'video/mp4'), false)
  assert.equal(matchesMagicBytes(Buffer.from('RIFFxxxxWEBP'), 'image/avif'), false)
  // header dipotong tepat di tengah daftar compatible brands
  assert.equal(matchesMagicBytes(ftyp('isom', ['mp41', 'mp42']).subarray(0, 18), 'video/mp4'), true)
})
