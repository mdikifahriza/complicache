import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  matchesMagicBytes,
  stripSvgScripts,
  detectMediaKind,
} from '../src/media/validator'

describe('Media Validator & Sanitizer', () => {
  it('matchesMagicBytes mengenali tanda biner JPEG yang sah', () => {
    const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    assert.equal(matchesMagicBytes(validJpeg, 'image/jpeg'), true)

    const fakeJpeg = Buffer.from([0x00, 0x01, 0x02, 0x03])
    assert.equal(matchesMagicBytes(fakeJpeg, 'image/jpeg'), false)
  })

  it('matchesMagicBytes mengenali tanda biner PNG yang sah', () => {
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    assert.equal(matchesMagicBytes(validPng, 'image/png'), true)

    const fakePng = Buffer.from([0xff, 0xd8, 0xff, 0x00])
    assert.equal(matchesMagicBytes(fakePng, 'image/png'), false)
  })

  it('matchesMagicBytes mengenali WebP yang sah', () => {
    // RIFF....WEBP
    const validWebp = Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'latin1')
    assert.equal(matchesMagicBytes(validWebp, 'image/webp'), true)

    const fakeWebp = Buffer.from('RIFF\x00\x00\x00\x00AVIF', 'latin1')
    assert.equal(matchesMagicBytes(fakeWebp, 'image/webp'), false)
  })

  it('matchesMagicBytes mengenali dokumen PDF yang sah', () => {
    const validPdf = Buffer.from('%PDF-1.7\n1 0 obj', 'utf8')
    assert.equal(matchesMagicBytes(validPdf, 'application/pdf'), true)

    const fakePdf = Buffer.from('NOT A PDF FILE', 'utf8')
    assert.equal(matchesMagicBytes(fakePdf, 'application/pdf'), false)
  })

  it('stripSvgScripts membuang tag script dan event handler XSS', () => {
    const dangerousSvg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="40" onload="alert('xss')" />
        <script>alert('pwned')</script>
        <a href="javascript:alert('link')"><text>Click</text></a>
      </svg>
    `

    const cleaned = stripSvgScripts(dangerousSvg)
    assert.equal(cleaned.includes('<script>'), false)
    assert.equal(cleaned.includes('onload'), false)
    assert.equal(cleaned.includes('javascript:'), false)
    assert.equal(cleaned.includes('<circle'), true)
  })

  it('detectMediaKind memetakan MIME type ke IMAGE, VIDEO, atau DOCUMENT', () => {
    assert.equal(detectMediaKind('image/webp'), 'IMAGE')
    assert.equal(detectMediaKind('video/mp4'), 'VIDEO')
    assert.equal(detectMediaKind('application/pdf'), 'DOCUMENT')
    assert.equal(detectMediaKind('application/zip'), 'DOCUMENT')
  })
})
